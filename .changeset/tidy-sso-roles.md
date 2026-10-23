---
"@rustrak/server": "minor"
---

SSO can now map provider groups to the global admin role (`OIDC_GROUPS_CLAIM`,
`OIDC_ADMIN_GROUPS`) and let the provider be the only way in
(`OIDC_DISABLE_PASSWORD_LOGIN`, with the bootstrap account kept as
break-glass). The public SSO configuration tells the login page which methods
are available, so the password form disappears when it is off.
