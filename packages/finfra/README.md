# finfra - Infrastructure

This package contains Terraform modules and Kubernetes manifests used to provision and operate getfluxo.io.

Usage:

1. Configure AWS credentials in your environment.
2. Edit terraform/variables.tf for region and CIDR blocks.
3. Run:

   cd packages/finfra/terraform
   terraform init
   terraform plan -out plan.tfplan
   terraform apply plan.tfplan

Kubernetes manifests are in packages/finfra/kubernetes and can be applied with the included script.
