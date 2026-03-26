# AWS Resource Groups — saved group in the console (filter by StackId tag from provider default_tags).

resource "aws_resourcegroups_group" "stack" {
  name = "${local.name_env}-stack"
  # AWS allows only [\sa-zA-Z0-9_.-] and spaces in description.
  description = "Gig demo stack resources filtered by StackId tag matching name-prefix-environment such as gig-demo-prod."

  resource_query {
    query = jsonencode({
      ResourceTypeFilters = ["AWS::AllSupported"]
      TagFilters = [
        {
          Key    = "StackId"
          Values = [local.name_env]
        }
      ]
    })
  }
}
