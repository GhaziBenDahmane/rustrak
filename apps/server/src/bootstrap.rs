use log::{info, warn};

use crate::db::DbPool;
use crate::error::AppResult;
use crate::models::{CreateUserRequest, UserRole};
use crate::services::UsersService;

/// Bootstrap initial superuser from the CREATE_SUPERUSER env var, which the
/// caller reads, so nothing here depends on process-wide state.
/// Format: "email:password"
/// Only creates user if database is empty
pub async fn create_superuser_if_needed(
    pool: &DbPool,
    create_superuser: Option<&str>,
) -> AppResult<()> {
    let create_superuser = match create_superuser {
        Some(val) if !val.is_empty() => val,
        _ => {
            info!("CREATE_SUPERUSER not set, skipping superuser creation");
            return Ok(());
        }
    };

    // Check if any users exist
    let user_count = UsersService::user_count(pool).await?;
    if user_count > 0 {
        warn!("CREATE_SUPERUSER set but users already exist. Skipping superuser creation.");
        return Ok(());
    }

    // Parse email:password
    let parts: Vec<&str> = create_superuser.splitn(2, ':').collect();
    if parts.len() != 2 {
        return Err(crate::error::AppError::Validation(
            "CREATE_SUPERUSER must be in format 'email:password'".to_string(),
        ));
    }

    let email = crate::models::User::normalize_email(parts[0]);
    let password = parts[1];

    if password.is_empty() {
        return Err(crate::error::AppError::Validation(
            "Password is required".to_string(),
        ));
    }

    // Create superuser
    let req = CreateUserRequest {
        email: email.clone(),
        password: password.to_string(),
    };

    UsersService::create_user(pool, &req, UserRole::Admin).await?;
    info!("✅ Superuser created: {}", email);

    Ok(())
}
