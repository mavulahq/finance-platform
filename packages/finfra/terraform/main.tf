terraform {
  required_version = ">= 1.4.0"
  required_providers {
    aws = {
      source = "hashicorp/aws"
      version = ">= 4.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# VPC placeholder (example minimal)
resource "aws_vpc" "main" {
  cidr_block = var.vpc_cidr
  tags = {
    Name = "getfluxo-vpc"
  }
}

# EKS cluster placeholder
module "eks" {
  source          = "terraform-aws-modules/eks/aws"
  cluster_name    = "getfluxo-eks"
  cluster_version = var.eks_version
  vpc_id          = aws_vpc.main.id
  # Additional configuration omitted: workers, node_groups, iam
}

output "vpc_id" {
  value = aws_vpc.main.id
}
