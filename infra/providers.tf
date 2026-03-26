provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      StackId     = local.name_env
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# ACM certificates for CloudFront must live in us-east-1.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      StackId     = local.name_env
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
