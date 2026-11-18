# Invites and Access Requests need a Subject that is an email

**Status:** Accepted (SP-5967)

Redeeming an **Invite** and making an **Access Request** both need the caller's **Subject** to be their email: a person whose access token carries a non-blank `email` (`requireEmailSubject`). Anyone else gets a 403 with `email_required`: a **Machine caller**, whose Subject is its client id, and a person whose access token has no `email`, whose Subject is their `sub`. An Invite that names a recipient can be redeemed only by the person whose Subject matches it, ignoring case. What either flow grants goes to that Subject.

Everything these flows grant then lands on an email, the same key a data admin types in a direct grant (ADR 0022). A grant on a `sub` would cause three problems:

- Nobody reading a grant list can tell whose it is, and an admin deciding an Access Request can't tell who asked.
- It stops matching the day the deployment starts putting `email` in its access tokens, which `docs/authentication.md` tells deployers to do. The person's Subject becomes their email and the grant stays on the `sub`.
- A colleague can't grant to it directly: nobody knows a colleague's `sub`.

Creating an Invite and deciding an Access Request need no email. They grant nothing to the caller, and they record the caller's Subject only as `created_by` or `decided_by`, as every other write does.

## Considered options

- **Ask the identity provider's userinfo endpoint when the access token has no `email`**: built, then removed. It matched an Invite's recipient, but the grant still went to the `sub`, with the three problems above. It also made redeeming depend on reaching the identity provider, and it doesn't work on every provider: Microsoft Entra ID serves userinfo from Microsoft Graph, which refuses a token issued for this API.
- **Resolve every caller's Subject through userinfo**: rejected. Direct grants would work too, but every request would depend on the identity provider. It would also change the Subject of every person on such a deployment, and it has the same Entra ID limit. A deployment can put `email` in its access tokens instead.
- **The frontend sends its id_token with the redeem call**: rejected. The id_token is issued to the frontend's client, it adds a second token to verify, and the grant would still go to the `sub`.
- **Grant to the recipient email when the Invite is created**: rejected. That is the existing direct grant, which has no pending state or expiry.
- **Requiring `email_verified`**: rejected, for the reason ADR 0022 gives: it would turn the feature off on many deployments without moving the trust boundary.

## Consequences

- On a deployment whose access tokens carry no `email`, Invites can be created but not redeemed, and Access Requests can't be made. The fix is to put `email` in the access token (`docs/authentication.md`).
- A Machine caller can't redeem an Invite or make an Access Request, even one whose token carries an email.
- The trust boundary is unchanged. An identity provider that issues an email the person does not own lets them redeem Invites sent to it, as it already lets them inherit grants (ADR 0022).
- A redeemer who does not match sees a masked hint (`j•••@example.com`), and the Invite stays pending.
- Matching a recipient ignores case. The grant goes to the Subject as the token spells it, and Subjects stay case-sensitive everywhere else.
