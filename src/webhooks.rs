//! Outbound webhooks: Bubble's key events, delivered by Svix to the endpoints
//! a customer registers in their Svix application. Svix signs every request
//! (Standard Webhooks), retries what fails and keeps the delivery log, so
//! nothing here signs, queues or retries: one call, and Svix owns it after.
//!
//! Off unless `SVIX_API_KEY` is set. `SVIX_APP_ID` names the application (one
//! per customer; `bubble` otherwise) and `SVIX_SERVER_URL` points at a
//! self-hosted Svix: a key ending in `.us`, `.eu`, `.in`, `.ca` or `.au` picks
//! the region on svix.com instead.
//!
//! `bubble webhook <event> [json] [--app <id>] [--id <event-id>]` sends one
//! from a shell, for example while a customer wires up their endpoint:
//! `bubble webhook core.lost '{"machine":"vps"}'`.

use serde_json::{Value, json};
use svix::api::{Svix, SvixOptions};
use svix::models::{MessageIn, MessageOut};

/// The app's key events: what a customer's endpoint subscribes to (the names
/// `telemetry::count` counts, in Svix's `what.happened` form).
pub const EVENTS: [&str; 4] = ["app.update_failed", "core.lost", "core.update_failed", "core.update_ok"];

const USAGE: &str = "usage: bubble webhook <event-type> [json] [--app <id>] [--id <event-id>]";

fn var(name: &str) -> Option<String> {
    std::env::var(name).ok().map(|v| v.trim().to_owned()).filter(|v| !v.is_empty())
}

/// The Svix client, or none without `SVIX_API_KEY`: nothing is sent, and Svix
/// is never asked anything, until the key is there.
fn client() -> Option<Svix> {
    let key = var("SVIX_API_KEY")?;
    let options = SvixOptions { server_url: var("SVIX_SERVER_URL"), ..SvixOptions::default() };
    Some(Svix::new(key, Some(options)))
}

/// The application whose endpoints get the event: one per customer.
fn app_id() -> String {
    var("SVIX_APP_ID").unwrap_or_else(|| "bubble".to_owned())
}

/// What the endpoint receives: which build and platform sent it (`app`), then
/// the event's own body (`data`), so one endpoint serves every OS and version.
fn payload(data: Value) -> Value {
    json!({
        "app": {
            "version": env!("CARGO_PKG_VERSION"),
            "os": std::env::consts::OS,
            "arch": std::env::consts::ARCH,
        },
        "data": data,
    })
}

/// Sends one event; Svix signs it, retries what fails and logs the delivery.
/// `event_id` makes a repeated send a duplicate rather than a second delivery
/// (unique per application, for a day).
fn send(client: &Svix, app_id: &str, event_type: &str, data: Value, event_id: Option<&str>) -> anyhow::Result<MessageOut> {
    let mut message = MessageIn::new(event_type.to_owned(), payload(data));
    message.event_id = event_id.map(str::to_owned);
    // Svix's client talks over hyper: a request needs a reactor under it.
    let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build()?;
    Ok(runtime.block_on(client.message().create(app_id.to_owned(), message, None))?)
}

/// `bubble webhook`: sends one event from a shell; the process exit code.
pub fn cli(args: &[String]) -> i32 {
    let (mut event, mut data, mut app, mut id) = (None, None, None, None);
    let mut it = args.iter();
    while let Some(arg) = it.next() {
        match arg.as_str() {
            "--app" | "--id" => {
                let Some(value) = it.next() else { return fail(&format!("{arg} needs a value")) };
                if arg.as_str() == "--app" { app = Some(value.to_owned()) } else { id = Some(value.to_owned()) }
            }
            flag if flag.starts_with("--") => return fail(&format!("unknown flag {flag:?}")),
            value if event.is_none() => event = Some(value.to_owned()),
            value if data.is_none() => match serde_json::from_str::<Value>(value) {
                Ok(json) => data = Some(json),
                Err(e) => return fail(&format!("payload is not JSON: {e}")),
            },
            value => return fail(&format!("unexpected {value:?}")),
        }
    }
    let Some(event) = event else { return fail(USAGE) };
    let Some(client) = client() else {
        eprintln!("bubble: SVIX_API_KEY is unset, so nothing was sent (events: {})", EVENTS.join(", "));
        return 1;
    };
    let app = app.unwrap_or_else(app_id);
    match send(&client, &app, &event, data.unwrap_or_else(|| json!({})), id.as_deref()) {
        Ok(message) => {
            let reply = json!({ "app": app, "message": serde_json::to_value(&message).unwrap_or(Value::Null) });
            println!("{}", serde_json::to_string_pretty(&reply).unwrap_or_default());
            0
        }
        Err(error) => {
            eprintln!("bubble: Svix did not take the webhook: {error:#}");
            1
        }
    }
}

fn fail(message: &str) -> i32 {
    eprintln!("bubble: {message}");
    2
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_payload_names_the_build_and_keeps_the_event() {
        let body = payload(json!({ "machine": "vps" }));
        assert_eq!(body["app"]["version"], env!("CARGO_PKG_VERSION"));
        assert_eq!(body["app"]["os"], std::env::consts::OS);
        assert_eq!(body["data"]["machine"], "vps");
    }

    #[test]
    fn a_webhook_needs_an_event_and_json() {
        assert_eq!(cli(&[]), 2);
        assert_eq!(cli(&["core.lost".to_owned(), "not json".to_owned()]), 2);
        assert_eq!(cli(&["core.lost".to_owned(), "--nope".to_owned()]), 2);
    }
}