//! OAuth 2.1 endpoints that let a web assistant connect to `/mcp` with the
//! user's consent (see `services::oauth` for the tokens themselves).
//!
//! - Discovery: protected resource metadata (RFC 9728) and authorization
//!   server metadata (RFC 8414) under `/.well-known`.
//! - Authorization: `/oauth/authorize` is a dashboard page. It reads the
//!   request through `GET /api/oauth/authorize` and posts the user's answer to
//!   `POST /api/oauth/authorize`, both behind the dashboard session. Consent
//!   is asked every time; nothing remembers an earlier approval.
//! - Token: `POST /api/oauth/token`, for public clients with PKCE.
//!
//! A request whose client or redirect cannot be verified is answered with an
//! error and never redirected: sending the browser to an unverified URL is
//! how authorization codes get stolen.

use std::sync::Arc;

use actix_web::http::StatusCode;
use actix_web::{web, HttpRequest, HttpResponse};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::auth::AuthenticatedUser;
use crate::config::Config;
use crate::db::DbPool;
use crate::error::{AppError, AppResult};
use crate::services::oauth::{
    pkce_matches, same_resource, verify_client, ClientMetadata, ClientMetadataSource, OAuthService,
};

/// Where this server is reached: `PUBLIC_URL` when set, otherwise what the
/// request says. Both the issuer and the resource tokens are bound to.
pub fn base_url(req: &HttpRequest, config: &Config) -> String {
    match &config.public_url {
        Some(url) => url.clone(),
        None => {
            let info = req.connection_info();
            format!("{}://{}", info.scheme(), info.host())
        }
    }
}

/// The resource a token for `/mcp` is issued for (RFC 8707).
pub fn mcp_resource(base: &str) -> String {
    format!("{base}/mcp")
}

/// Where an MCP client learns how to authorize (RFC 9728).
pub fn resource_metadata_url(base: &str) -> String {
    format!("{base}/.well-known/oauth-protected-resource/mcp")
}

async fn protected_resource(req: HttpRequest, config: web::Data<Config>) -> HttpResponse {
    let base = base_url(&req, &config);
    HttpResponse::Ok().json(json!({
        "resource": mcp_resource(&base),
        "authorization_servers": [base],
        "bearer_methods_supported": ["header"],
        "resource_name": "Rustrak",
    }))
}

async fn authorization_server(req: HttpRequest, config: web::Data<Config>) -> HttpResponse {
    let base = base_url(&req, &config);
    HttpResponse::Ok().json(json!({
        "issuer": base,
        "authorization_endpoint": format!("{base}/oauth/authorize"),
        "token_endpoint": format!("{base}/api/oauth/token"),
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "code_challenge_methods_supported": ["S256"],
        "token_endpoint_auth_methods_supported": ["none"],
        "client_id_metadata_document_supported": true,
        "authorization_response_iss_parameter_supported": true,
    }))
}

/// An authorization request, as the client put it in the authorize URL.
#[derive(Debug, Deserialize, Serialize)]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema, utoipa::IntoParams))]
pub struct AuthorizationRequest {
    pub response_type: String,
    pub client_id: String,
    pub redirect_uri: String,
    pub code_challenge: String,
    pub code_challenge_method: String,
    #[serde(default)]
    pub state: Option<String>,
    #[serde(default)]
    pub resource: Option<String>,
}

/// What the consent page shows about the client asking.
#[derive(Debug, Serialize)]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct AuthorizationInfo {
    pub client_id: String,
    pub client_name: String,
    /// Host the user is sent back to, the one fact a lookalike name cannot fake.
    pub redirect_host: String,
}

/// The user's answer to a consent screen.
#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct AuthorizationDecision {
    #[serde(flatten)]
    pub request: AuthorizationRequest,
    pub approve: bool,
}

/// Where the consent page sends the browser next.
#[derive(Debug, Serialize)]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct AuthorizationRedirect {
    pub redirect_to: String,
}

type Clients = web::Data<Arc<dyn ClientMetadataSource>>;

/// Validates a request in full, returning the verified client and the
/// resource the token will be bound to.
async fn verify(
    request: &AuthorizationRequest,
    base: &str,
    clients: &dyn ClientMetadataSource,
) -> AppResult<(ClientMetadata, String)> {
    let invalid = |why: &str| Err(AppError::Validation(why.to_string()));
    if request.response_type != "code" {
        return invalid("response_type must be \"code\"");
    }
    if request.code_challenge_method != "S256" || request.code_challenge.len() != 43 {
        return invalid("A PKCE code_challenge with method S256 is required");
    }
    let resource = mcp_resource(base);
    if let Some(asked) = &request.resource {
        if !same_resource(asked, &resource) {
            return invalid("resource must be this server's MCP endpoint");
        }
    }
    let client = verify_client(clients, &request.client_id, &request.redirect_uri).await?;
    Ok((client, resource))
}

#[cfg_attr(feature = "openapi", utoipa::path(
    get,
    path = "/api/oauth/authorize",
    operation_id = "oauth.getAuthorization",
    tag = "OAuth",
    params(AuthorizationRequest),
    responses(
        (status = 200, description = "The verified client asking for access", body = AuthorizationInfo),
        (status = 400, description = "The request cannot be trusted", body = crate::error::ErrorResponse),
        (status = 401, description = "Not signed in", body = crate::error::ErrorResponse),
    ),
))]
/// Verifies an authorization request and says who is asking.
pub async fn get_authorization(
    req: HttpRequest,
    config: web::Data<Config>,
    clients: Clients,
    // Before the query: a signed-out caller learns nothing about the request.
    _user: AuthenticatedUser,
    query: web::Query<AuthorizationRequest>,
) -> AppResult<HttpResponse> {
    let base = base_url(&req, &config);
    let (client, _) = verify(&query, &base, clients.get_ref().as_ref()).await?;
    let redirect_host = url::Url::parse(&query.redirect_uri)
        .ok()
        .and_then(|u| u.host_str().map(str::to_string))
        .unwrap_or_default();
    Ok(HttpResponse::Ok().json(AuthorizationInfo {
        client_id: client.client_id,
        client_name: client.client_name,
        redirect_host,
    }))
}

#[cfg_attr(feature = "openapi", utoipa::path(
    post,
    path = "/api/oauth/authorize",
    operation_id = "oauth.decideAuthorization",
    tag = "OAuth",
    request_body = AuthorizationDecision,
    responses(
        (status = 200, description = "Where to send the browser", body = AuthorizationRedirect),
        (status = 400, description = "The request cannot be trusted", body = crate::error::ErrorResponse),
        (status = 401, description = "Not signed in", body = crate::error::ErrorResponse),
    ),
))]
/// Approves or denies an authorization request as the signed-in user.
pub async fn decide_authorization(
    req: HttpRequest,
    pool: web::Data<DbPool>,
    config: web::Data<Config>,
    clients: Clients,
    user: AuthenticatedUser,
    body: web::Json<AuthorizationDecision>,
) -> AppResult<HttpResponse> {
    let base = base_url(&req, &config);
    let request = &body.request;
    // Verified again: the page could have been handed anything since.
    let (client, resource) = verify(request, &base, clients.get_ref().as_ref()).await?;

    let mut redirect = url::Url::parse(&request.redirect_uri)
        .map_err(|_| AppError::Validation("redirect_uri is not a URL".into()))?;
    {
        let mut query = redirect.query_pairs_mut();
        if body.approve {
            let code = OAuthService::create_code(
                pool.get_ref(),
                user.0.id,
                &client,
                &request.redirect_uri,
                &resource,
                &request.code_challenge,
            )
            .await?;
            query.append_pair("code", &code);
        } else {
            query.append_pair("error", "access_denied");
        }
        if let Some(state) = &request.state {
            query.append_pair("state", state);
        }
        // RFC 9207: names the issuer, so a client cannot be tricked into
        // redeeming this code at another server's token endpoint.
        query.append_pair("iss", &base);
    }
    Ok(HttpResponse::Ok().json(AuthorizationRedirect {
        redirect_to: redirect.into(),
    }))
}

#[derive(Debug, Deserialize)]
struct TokenRequest {
    grant_type: String,
    code: Option<String>,
    redirect_uri: Option<String>,
    client_id: Option<String>,
    code_verifier: Option<String>,
    refresh_token: Option<String>,
    resource: Option<String>,
}

/// An RFC 6749 error from the token endpoint.
fn token_error(error: &str, description: &str) -> HttpResponse {
    HttpResponse::build(StatusCode::BAD_REQUEST)
        .insert_header(("Cache-Control", "no-store"))
        .json(json!({ "error": error, "error_description": description }))
}

/// `POST /api/oauth/token`: exchanges a code, or rotates a refresh token.
async fn token(pool: web::Data<DbPool>, form: web::Form<TokenRequest>) -> AppResult<HttpResponse> {
    let invalid_grant = |why| Ok(token_error("invalid_grant", why));
    let Some(client_id) = form.client_id.as_deref() else {
        return Ok(token_error("invalid_request", "client_id is required"));
    };

    let pair = match form.grant_type.as_str() {
        "authorization_code" => {
            let (Some(code), Some(verifier), Some(redirect_uri)) = (
                form.code.as_deref(),
                form.code_verifier.as_deref(),
                form.redirect_uri.as_deref(),
            ) else {
                return Ok(token_error(
                    "invalid_request",
                    "code, code_verifier and redirect_uri are required",
                ));
            };
            let Some(issued) = OAuthService::redeem_code(pool.get_ref(), code).await? else {
                return invalid_grant("Unknown or already used code");
            };
            if issued.expires_at <= chrono::Utc::now()
                || issued.client_id != client_id
                || issued.redirect_uri != redirect_uri
            {
                return invalid_grant("The code was not issued for this request");
            }
            if !pkce_matches(verifier, &issued.code_challenge) {
                return invalid_grant("code_verifier does not match the code_challenge");
            }
            if let Some(resource) = &form.resource {
                if !same_resource(resource, &issued.resource) {
                    return Ok(token_error("invalid_target", "Not the authorized resource"));
                }
            }
            OAuthService::create_grant(pool.get_ref(), &issued).await?
        }
        "refresh_token" => {
            let Some(refresh) = form.refresh_token.as_deref() else {
                return Ok(token_error("invalid_request", "refresh_token is required"));
            };
            match OAuthService::refresh(pool.get_ref(), refresh, client_id).await? {
                Some(pair) => pair,
                None => return invalid_grant("Unknown, used or expired refresh token"),
            }
        }
        _ => {
            return Ok(token_error(
                "unsupported_grant_type",
                "Use authorization_code or refresh_token",
            ))
        }
    };
    Ok(HttpResponse::Ok()
        .insert_header(("Cache-Control", "no-store"))
        .json(pair))
}

#[cfg_attr(feature = "openapi", utoipa::path(
    get,
    path = "/api/oauth/grants",
    operation_id = "oauth.listGrants",
    tag = "OAuth",
    responses(
        (status = 200, description = "Assistants connected to your account", body = Vec<crate::services::oauth::OAuthGrant>),
        (status = 401, description = "Not signed in", body = crate::error::ErrorResponse),
    ),
))]
/// Lists the assistants connected to the signed-in user's account.
pub async fn list_grants(
    pool: web::Data<DbPool>,
    user: AuthenticatedUser,
) -> AppResult<HttpResponse> {
    Ok(HttpResponse::Ok().json(OAuthService::list_grants(pool.get_ref(), user.0.id).await?))
}

#[cfg_attr(feature = "openapi", utoipa::path(
    delete,
    path = "/api/oauth/grants/{id}",
    operation_id = "oauth.revokeGrant",
    tag = "OAuth",
    params(("id" = i32, Path, description = "Connection ID")),
    responses(
        (status = 204, description = "Disconnected"),
        (status = 401, description = "Not signed in", body = crate::error::ErrorResponse),
        (status = 404, description = "Not one of your connections", body = crate::error::ErrorResponse),
    ),
))]
/// Disconnects an assistant: its tokens stop working at once.
pub async fn revoke_grant(
    pool: web::Data<DbPool>,
    user: AuthenticatedUser,
    path: web::Path<i32>,
) -> AppResult<HttpResponse> {
    OAuthService::revoke(pool.get_ref(), user.0.id, path.into_inner()).await?;
    Ok(HttpResponse::NoContent().finish())
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.route(
        "/.well-known/oauth-protected-resource",
        web::get().to(protected_resource),
    )
    .route(
        "/.well-known/oauth-protected-resource/mcp",
        web::get().to(protected_resource),
    )
    .route(
        "/.well-known/oauth-authorization-server",
        web::get().to(authorization_server),
    )
    .service(
        web::resource("/api/oauth/authorize")
            .route(web::get().to(get_authorization))
            .route(web::post().to(decide_authorization)),
    )
    .route("/api/oauth/token", web::post().to(token))
    .route("/api/oauth/grants", web::get().to(list_grants))
    .route("/api/oauth/grants/{id}", web::delete().to(revoke_grant));
}
