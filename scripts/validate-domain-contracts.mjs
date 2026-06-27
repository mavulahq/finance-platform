import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), "..");
const defaultContractsDir = path.join(root, "contracts", "domain-events");

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

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const result = validateContracts();
  console.log(
    `Validated ${result.contractCount} event contracts and ${result.exampleCount} examples.`,
  );
}
