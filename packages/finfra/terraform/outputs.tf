output "eks_cluster_name" {
  value = module.eks.cluster_id
}

output "region" {
  value = var.aws_region
}
