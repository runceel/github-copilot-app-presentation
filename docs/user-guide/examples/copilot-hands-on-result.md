---
title: Internal deployment service architecture review
deck: Deployment service architecture review
theme: microsoft
layout: title
---

# Internal deployment service

Architecture review for a small engineering platform

---
kicker: Problem and objective
---

## Make deployments safe and repeatable

- Teams need a **single, auditable path** from merge to production
- Manual deployment steps create drift, delays, and unclear ownership
- Objective: provide a small internal service that standardizes releases
- Optimize for low operational overhead and clear recovery paths

<!--
Frame the review around reducing deployment variance without building a large platform.
-->

---
kicker: Requirements
---

## Guardrails for the first release

- Trigger deployments from **GitHub Actions** with authenticated requests
- Run workloads on **Azure Container Apps** with environment isolation
- Keep secrets in **Azure Key Vault**, never in workflow files or logs
- Persist release status and audit metadata in **Azure SQL**
- Support idempotent requests, observable failures, and operator rollback

<!--
Confirm these are the minimum acceptance criteria; defer advanced orchestration until usage validates the design.
-->

---
kicker: Target architecture
---

## A thin deployment control plane

```architecture
{
  "version": 1,
  "title": "Internal deployment service",
  "description": "Developer-triggered deployments with secret retrieval and release status persistence.",
  "canvas": { "width": 1280, "height": 620 },
  "elements": [
    {
      "type": "node",
      "id": "developer",
      "x": 30,
      "y": 250,
      "width": 190,
      "height": 100,
      "text": "Developer",
      "icon": "user",
      "ariaLabel": "Developer"
    },
    {
      "type": "node",
      "id": "github-actions",
      "x": 300,
      "y": 250,
      "width": 210,
      "height": 100,
      "text": "GitHub Actions",
      "icon": "server",
      "ariaLabel": "GitHub Actions"
    },
    {
      "type": "node",
      "id": "deployment-api",
      "x": 590,
      "y": 250,
      "width": 220,
      "height": 100,
      "text": "Deployment API",
      "icon": "api",
      "ariaLabel": "Deployment API"
    },
    {
      "type": "node",
      "id": "container-apps",
      "x": 900,
      "y": 250,
      "width": 260,
      "height": 100,
      "text": "Azure Container Apps",
      "icon": "cloud",
      "ariaLabel": "Azure Container Apps"
    },
    {
      "type": "node",
      "id": "key-vault",
      "x": 610,
      "y": 40,
      "width": 180,
      "height": 90,
      "text": "Azure Key Vault",
      "icon": "shield",
      "ariaLabel": "Azure Key Vault"
    },
    {
      "type": "node",
      "id": "azure-sql",
      "x": 610,
      "y": 470,
      "width": 180,
      "height": 90,
      "text": "Azure SQL",
      "icon": "database",
      "ariaLabel": "Azure SQL"
    },
    {
      "type": "connector",
      "from": "developer",
      "to": "github-actions",
      "fromPort": "right",
      "toPort": "left",
      "routing": "orthogonal",
      "ariaLabel": "Developer triggers GitHub Actions",
      "arrow": true,
      "style": { "strokeWidth": 3 }
    },
    {
      "type": "connector",
      "from": "github-actions",
      "to": "deployment-api",
      "fromPort": "right",
      "toPort": "left",
      "routing": "orthogonal",
      "ariaLabel": "GitHub Actions sends an authenticated deployment request to Deployment API",
      "arrow": true,
      "style": { "strokeWidth": 3 }
    },
    {
      "type": "connector",
      "from": "deployment-api",
      "to": "container-apps",
      "fromPort": "right",
      "toPort": "left",
      "routing": "orthogonal",
      "ariaLabel": "Deployment API deploys a revision to Azure Container Apps",
      "arrow": true,
      "style": { "strokeWidth": 3 }
    },
    {
      "type": "connector",
      "from": "deployment-api",
      "to": "key-vault",
      "fromPort": "top",
      "toPort": "bottom",
      "routing": "orthogonal",
      "label": "secrets",
      "ariaLabel": "Deployment API reads secrets from Azure Key Vault",
      "arrow": true,
      "style": { "strokeWidth": 3, "fontSize": 14 }
    },
    {
      "type": "connector",
      "from": "deployment-api",
      "to": "azure-sql",
      "fromPort": "bottom",
      "toPort": "top",
      "routing": "orthogonal",
      "label": "status",
      "ariaLabel": "Deployment API writes release status to Azure SQL",
      "arrow": true,
      "style": { "strokeWidth": 3, "fontSize": 14 }
    }
  ]
}
```

<!--
Walk left to right through the control path, then call out the two bounded data dependencies.
-->

---
kicker: Rollout plan
---

## Prove the path before expanding scope

- **Phase 1 — pilot:** one service, one Container Apps environment, least-privilege identities
- **Phase 2 — harden:** retries, idempotency keys, dashboards, and rollback runbooks
- **Phase 3 — scale:** onboard teams with templates, quotas, and environment policy
- Review deployment failure rate, lead time, and operator effort after each phase

<!--
Recommend a narrow pilot so the team can validate the API contract and operational model quickly.
-->

---
kicker: Risks and next steps
---

## Keep the control plane small

| Risk | Mitigation |
| --- | --- |
| Credential misuse | Managed identity, scoped access, short-lived workflow tokens |
| Partial deployment failure | Idempotency, status transitions, and documented rollback |
| Service becomes a bottleneck | Queue long-running work and expose clear progress |
| Incomplete audit trail | Write immutable release events to Azure SQL |

**Next:** confirm pilot owner, define the API contract, and select the first workload.

<!--
Close by asking for agreement on the pilot boundary and the three decisions needed to start implementation.
-->
