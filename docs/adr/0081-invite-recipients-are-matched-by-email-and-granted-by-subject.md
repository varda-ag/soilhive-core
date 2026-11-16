# Invite recipients are matched by their email and granted by their Subject

**Status:** Proposed — agreed in design, not built yet.

An **Invite** may name a recipient by email, and then only that person can redeem it. The recipient is compared, ignoring case, with the redeemer's access token `email`. When the token has none, it is compared with the `email` the identity provider's userinfo endpoint returns for that access token, once the response's `sub` is checked against the token's. What is granted goes to the redeemer's **Subject** (`getSubject`), never to the email the Invite names. Only a person can match: a **Machine caller**'s Subject is never an email.

ADR 0022 says the id_token/userinfo email must not stand in for the access token's. That rule is about the Subject: a grant keyed by that email would match nobody. Here the email only decides who may redeem, and the key stays the Subject. So on a deployment whose access tokens carry no `email`, an admin can name a person by email and the grant lands on their `sub`, the identifier ADR 0022 rejected keying grants on because nobody knows a colleague's.

## Considered options

- **The frontend sends its id_token with the redeem call**: rejected. The id_token is issued to the frontend's client, it adds a second token to verify, and it needs frontend changes. Userinfo answers the same question with the token the backend already has.
- **The access token's `email` only**: rejected. Recipient Invites could not be redeemed on deployments without it, which is where they help most.
- **Grant to the recipient email when the Invite is created**: rejected. That is the existing direct grant, which silently matches nobody when the email is not the Subject, and it has no pending state or expiry.
- **Requiring `email_verified`**: rejected, for the reason ADR 0022 gives: it would turn the feature off on many deployments without moving the trust boundary.

## Consequences

- The trust boundary is unchanged. An identity provider that issues an email the person does not own lets them redeem Invites sent to it, as it already lets them inherit grants (ADR 0022).
- Where the access token has no `email`, redeeming calls the identity provider once. If that fails, redemption fails and the Invite stays pending.
- A redeemer who does not match sees a masked hint (`j•••@example.com`), and the Invite stays pending.
- Matching ignores case. Subjects stay case-sensitive everywhere else.
