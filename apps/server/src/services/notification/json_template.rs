//! Context-aware escaping for JSON body templates.
//!
//! A Custom Webhook body is JSON with template expressions in it. Where an
//! expression sits decides how its value has to be written: inside a string
//! literal it is text that must not close the string, in a value position it
//! is a JSON value of its own. Asking the writer to remember that (`| tojson`
//! here, nothing there) is how every alerting tool with a raw template ends up
//! with an issue titled "a quote in the message breaks the JSON".
//!
//! So the template is rewritten before it compiles. The literal text between
//! tags is scanned the way a JSON parser would, tracking whether the scan is
//! inside a string, and every `{{ … }}` is wrapped with the filter its
//! position needs. An expression that already ends in `| tojson` is left
//! alone, so a body written the explicit way keeps meaning what it said.

use minijinja::value::Value;
use minijinja::{Error, ErrorKind};

/// Name of the filter that writes a value as the inside of a JSON string.
pub const STRING_FILTER: &str = "json_string";

/// Name of the filter that writes a value as a JSON value of its own.
pub const VALUE_FILTER: &str = "json_value";

/// Rewrites `{{ … }}` expressions so each renders correctly for where it is.
///
/// `{% … %}` blocks and `{# … #}` comments are passed through untouched and do
/// not move the string tracker: they emit nothing, so the JSON around them is
/// what decides the context.
pub fn autoescape(template: &str) -> String {
    let mut out = String::with_capacity(template.len() + 64);
    let bytes = template.as_bytes();
    let mut in_string = false;
    let mut i = 0;

    while i < bytes.len() {
        // A tag other than an expression: copy it through verbatim.
        if let Some(end) = tag_end(template, i, "{%", "%}").or(tag_end(template, i, "{#", "#}")) {
            out.push_str(&template[i..end]);
            i = end;
            continue;
        }

        if let Some(end) = tag_end(template, i, "{{", "}}") {
            let inner = &template[i + 2..end - 2];
            out.push_str(&wrap(inner, in_string));
            i = end;
            continue;
        }

        let ch = template[i..].chars().next().unwrap_or_default();
        match ch {
            '\\' if in_string => {
                // Copy the escape and what it escapes, so `\"` cannot close.
                let next = template[i + 1..].chars().next();
                out.push(ch);
                i += ch.len_utf8();
                if let Some(next) = next {
                    out.push(next);
                    i += next.len_utf8();
                }
                continue;
            }
            '"' => in_string = !in_string,
            _ => {}
        }
        out.push(ch);
        i += ch.len_utf8();
    }

    out
}

/// End offset (exclusive) of the tag opening at `at`, if one opens there.
fn tag_end(template: &str, at: usize, open: &str, close: &str) -> Option<usize> {
    if !template[at..].starts_with(open) {
        return None;
    }
    template[at + open.len()..]
        .find(close)
        .map(|rel| at + open.len() + rel + close.len())
}

/// The expression rewritten for its position. Trailing whitespace is kept
/// outside the parentheses so the source stays readable in error messages.
fn wrap(inner: &str, in_string: bool) -> String {
    let expr = inner.trim();
    if expr.is_empty() || ends_with_filter(expr, "tojson") {
        return format!("{{{{{inner}}}}}");
    }
    let filter = if in_string {
        STRING_FILTER
    } else {
        VALUE_FILTER
    };
    // The source travels along as a string literal (JSON escaping is a subset
    // of minijinja's), so a failure can name what the writer typed.
    let source = serde_json::to_string(expr).unwrap_or_else(|_| "\"\"".to_string());
    format!("{{{{ ({expr}) | {filter}({source}) }}}}")
}

/// Whether the last filter applied in `expr` is `name`, with or without
/// arguments: `x | tojson`, `x|tojson`, `x | tojson(indent=2)`.
fn ends_with_filter(expr: &str, name: &str) -> bool {
    let Some(tail) = expr.rsplit('|').next() else {
        return false;
    };
    let tail = tail.trim();
    tail == name || tail.starts_with(name) && tail[name.len()..].trim_start().starts_with('(')
}

/// Writes a value as a JSON value: `tojson`, except that a field which does
/// not exist is an error rather than `null`. A typo must fail at save time.
pub fn json_value(value: Value, source: Option<String>) -> Result<Value, Error> {
    if value.is_undefined() {
        return Err(undefined_field(source));
    }
    serde_json::to_string(&value)
        .map(Value::from_safe_string)
        .map_err(|e| {
            Error::new(
                ErrorKind::BadSerialization,
                format!("cannot serialise value: {e}"),
            )
        })
}

fn undefined_field(source: Option<String>) -> Error {
    let what = source
        .map(|s| format!("`{s}`"))
        .unwrap_or_else(|| "the field".to_string());
    Error::new(
        ErrorKind::UndefinedError,
        format!("{what} is not a field of the alert payload"),
    )
}

/// Writes a value as JSON string *content*: what goes between the quotes,
/// escaped, without the quotes. `none` becomes nothing, the way an absent
/// field reads in a sentence. Anything that is not a string is written the way
/// JSON would write it, so a number stays `3` and an object stays an object.
pub fn json_string(value: Value, source: Option<String>) -> Result<Value, Error> {
    if value.is_undefined() {
        return Err(undefined_field(source));
    }
    if value.is_none() {
        return Ok(Value::from(""));
    }
    let raw = match value.as_str() {
        Some(text) => text.to_string(),
        None => serde_json::to_string(&value).map_err(|e| {
            Error::new(
                ErrorKind::BadSerialization,
                format!("cannot serialise value: {e}"),
            )
        })?,
    };
    let quoted = serde_json::to_string(&raw)
        .map_err(|e| Error::new(ErrorKind::BadSerialization, format!("cannot escape: {e}")))?;
    Ok(Value::from(&quoted[1..quoted.len() - 1]))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expression_inside_a_string_gets_the_string_filter() {
        assert_eq!(
            autoescape(r#"{"t": "Hi {{ issue.title }}"}"#),
            r#"{"t": "Hi {{ (issue.title) | json_string("issue.title") }}"}"#
        );
    }

    #[test]
    fn expression_in_value_position_gets_tojson() {
        assert_eq!(
            autoescape(r#"{"n": {{ issue.event_count }}}"#),
            r#"{"n": {{ (issue.event_count) | json_value("issue.event_count") }}}"#
        );
    }

    #[test]
    fn explicit_tojson_is_left_alone_in_both_positions() {
        let template = r#"{"a": {{ issue.title | tojson }}, "b": "{{ x|tojson }}", "c": {{ y | tojson(indent=2) }}}"#;
        assert_eq!(autoescape(template), template);
    }

    #[test]
    fn other_filters_are_wrapped_not_replaced() {
        assert_eq!(
            autoescape(r#"{"t": "{{ issue.title | upper }}"}"#),
            r#"{"t": "{{ (issue.title | upper) | json_string("issue.title | upper") }}"}"#
        );
    }

    #[test]
    fn escaped_quotes_do_not_flip_the_string_tracker() {
        assert_eq!(
            autoescape(r#"{"t": "say \"{{ a }}\" and {{ b }}"}"#),
            r#"{"t": "say \"{{ (a) | json_string("a") }}\" and {{ (b) | json_string("b") }}"}"#
        );
    }

    #[test]
    fn blocks_and_comments_pass_through_without_moving_the_tracker() {
        assert_eq!(
            autoescape(r#"{"t": "{% if issue.level %}{{ issue.level }}{% endif %}{# "quote" #}"}"#),
            r#"{"t": "{% if issue.level %}{{ (issue.level) | json_string("issue.level") }}{% endif %}{# "quote" #}"}"#
        );
    }

    #[test]
    fn unicode_around_expressions_survives() {
        assert_eq!(
            autoescape(r#"{"t": "告警 {{ issue.title }} ✓"}"#),
            r#"{"t": "告警 {{ (issue.title) | json_string("issue.title") }} ✓"}"#
        );
    }

    #[test]
    fn an_unclosed_expression_is_copied_as_text() {
        // Left for minijinja to report as the syntax error it is.
        assert_eq!(
            autoescape(r#"{"t": "{{ issue.title"#),
            r#"{"t": "{{ issue.title"#
        );
    }

    #[test]
    fn json_string_escapes_and_strips_quotes() {
        let out = json_string(Value::from("He said \"boom\"\nbye"), None).unwrap();
        assert_eq!(out.as_str().unwrap(), r#"He said \"boom\"\nbye"#);
    }

    #[test]
    fn json_string_writes_none_as_nothing_and_scalars_plainly() {
        assert_eq!(
            json_string(Value::from(()), None).unwrap().as_str(),
            Some("")
        );
        assert_eq!(
            json_string(Value::from(3), None).unwrap().as_str(),
            Some("3")
        );
        assert_eq!(
            json_string(Value::from(true), None).unwrap().as_str(),
            Some("true")
        );
    }

    #[test]
    fn both_filters_refuse_an_undefined_field() {
        for err in [
            json_string(Value::UNDEFINED, Some("issue.titel".into())).unwrap_err(),
            json_value(Value::UNDEFINED, Some("issue.titel".into())).unwrap_err(),
        ] {
            assert_eq!(err.kind(), ErrorKind::UndefinedError);
            assert!(
                err.to_string().contains("`issue.titel` is not a field"),
                "the failure must name what was typed, got: {err}"
            );
        }
    }

    #[test]
    fn json_value_writes_json() {
        assert_eq!(
            json_value(Value::from("a\"b"), None).unwrap().as_str(),
            Some(r#""a\"b""#)
        );
        assert_eq!(
            json_value(Value::from(()), None).unwrap().as_str(),
            Some("null")
        );
        assert_eq!(
            json_value(Value::from(3), None).unwrap().as_str(),
            Some("3")
        );
    }
}
