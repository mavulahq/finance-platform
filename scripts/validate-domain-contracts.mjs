import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), "..");
const defaultContractsDir = path.join(root, "contracts", "domain-events");
const defaultIdentityContractsDir = path.join(root, "contracts", "identity");
const defaultRegulatoryContractsDir = path.join(root, "contracts", "regulatory");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function formatErrors(errors) {
  return (errors || [])
    .map((error) => `${error.instancePath || "/"} ${error.message}`)
    .join("; ");
}

function fail(message) {
  throw new Error(message);
}

export function validateContracts(contractsDir = defaultContractsDir) {
  const examplesDir = path.join(contractsDir, "examples");
  const envelopeSchema = readJson(
    path.join(contractsDir, "event-envelope.schema.json"),
  );
  const catalogSchema = readJson(
    path.join(contractsDir, "event-catalog.schema.json"),
  );
  const catalog = readJson(path.join(contractsDir, "event-catalog.json"));

  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);

  const validateEnvelope = ajv.compile(envelopeSchema);
  const validateCatalog = ajv.compile(catalogSchema);
  const payloadValidators = new Map();

  if (!validateCatalog(catalog)) {
    fail(`Invalid event catalog: ${formatErrors(validateCatalog.errors)}`);
  }

  const catalogByContract = new Map();
  for (const event of catalog.events) {
    const contractId = `${event.event_type}@${event.event_version}`;
    if (catalogByContract.has(contractId)) {
      fail(`Duplicate event contract: ${contractId}`);
    }

    if (event.status === "active") {
      if (!event.payload_schema) {
        fail(`Active event ${contractId} must declare payload_schema`);
      }

      const payloadSchemaPath = path.resolve(
        contractsDir,
        event.payload_schema,
      );
      if (!payloadSchemaPath.startsWith(`${contractsDir}${path.sep}`)) {
        fail(
          `Payload schema for ${contractId} must stay inside contracts/domain-events`,
        );
      }
      if (!fs.existsSync(payloadSchemaPath)) {
        fail(
          `Payload schema for ${contractId} does not exist: ${event.payload_schema}`,
        );
      }
      payloadValidators.set(
        contractId,
        ajv.compile(readJson(payloadSchemaPath)),
      );
    }

    catalogByContract.set(contractId, event);
  }

  const exampleFiles = fs
    .readdirSync(examplesDir)
    .filter((fileName) => fileName.endsWith(".json"))
    .sort();

  if (exampleFiles.length === 0) {
    fail("At least one domain event example is required");
  }

  for (const fileName of exampleFiles) {
    const example = readJson(path.join(examplesDir, fileName));
    if (!validateEnvelope(example)) {
      fail(
        `Invalid example ${fileName}: ${formatErrors(validateEnvelope.errors)}`,
      );
    }

    const contractId = `${example.event_type}@${example.event_version}`;
    const catalogEntry = catalogByContract.get(contractId);
    if (!catalogEntry) {
      fail(
        `Example ${fileName} references event missing from catalog: ${contractId}`,
      );
    }
    if (catalogEntry.producer !== example.metadata.producer) {
      fail(
        `Producer mismatch for ${fileName}: expected ${catalogEntry.producer}`,
      );
    }
    if (catalogEntry.aggregate_type !== example.aggregate.type) {
      fail(
        `Aggregate mismatch for ${fileName}: expected ${catalogEntry.aggregate_type}`,
      );
    }
    if (
      catalogEntry.data_classification !== example.metadata.data_classification
    ) {
      fail(`Data classification mismatch for ${fileName}`);
    }
    if (
      example.metadata.schema_uri
      && example.metadata.schema_uri !== "contracts/domain-events/event-envelope.schema.json"
    ) {
      fail(`Schema URI for ${fileName} must point to the event envelope schema`);
    }
    const validatePayload = payloadValidators.get(contractId);
    if (validatePayload && !validatePayload(example.payload)) {
      fail(
        `Invalid payload for ${fileName}: ${formatErrors(validatePayload.errors)}`,
      );
    }
  }

  return {
    contractCount: catalog.events.length,
    exampleCount: exampleFiles.length,
  };
}

export function validateIdentityContracts(contractsDir = defaultIdentityContractsDir) {
  const schema = readJson(path.join(contractsDir, "access-token-claims.schema.json"));
  const examplesDir = path.join(contractsDir, "examples");
  const exampleFiles = fs.readdirSync(examplesDir).filter((name) => name.endsWith(".json")).sort();
  if (exampleFiles.length === 0) fail("At least one identity claim example is required");
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  for (const fileName of exampleFiles) {
    if (!validate(readJson(path.join(examplesDir, fileName)))) {
      fail(`Invalid identity example ${fileName}: ${formatErrors(validate.errors)}`);
    }
  }
  return { exampleCount: exampleFiles.length };
}

export function validateRegulatoryContracts(contractsDir = defaultRegulatoryContractsDir) {
  const catalog = readJson(path.join(contractsDir, "catalog.json"));
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const seen = new Set();
  for (const contract of catalog.contracts || []) {
    if (seen.has(contract.contract_id)) fail(`Duplicate regulatory contract: ${contract.contract_id}`);
    seen.add(contract.contract_id);
    if (contract.data_classification !== "restricted") {
      fail(`Regulatory contract ${contract.contract_id} must be restricted`);
    }
    const schemaPath = path.resolve(contractsDir, contract.schema);
    const examplePath = path.resolve(contractsDir, contract.example);
    if (!schemaPath.startsWith(`${contractsDir}${path.sep}`) || !examplePath.startsWith(`${contractsDir}${path.sep}`)) {
      fail(`Regulatory contract ${contract.contract_id} must stay inside contracts/regulatory`);
    }
    const validate = ajv.compile(readJson(schemaPath));
    if (!validate(readJson(examplePath))) {
      fail(`Invalid regulatory example ${contract.example}: ${formatErrors(validate.errors)}`);
    }
  }
  if (seen.size !== 3) fail("Exactly three regulatory v1 contracts are required");
  return { contractCount: seen.size };
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const result = validateContracts();
  const identityResult = validateIdentityContracts();
  const regulatoryResult = validateRegulatoryContracts();
  console.log(
    `Validated ${result.contractCount} event contracts, ${result.exampleCount} event examples, ${identityResult.exampleCount} identity examples, and ${regulatoryResult.contractCount} regulatory contracts.`,
  );
}
