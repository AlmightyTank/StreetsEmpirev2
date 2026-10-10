# Automatic VPS deployments

A push to `beta` or `main` runs validation against that exact pushed commit.
After typechecking, tests, migrations in a disposable CI database, and the full
build pass, GitHub Actions connects to the VPS and deploys that same commit:

- `beta` → `/opt/streets-empire/StreetsEmpirev2-beta` → beta services/database.
- `main` → `/opt/streets-empire/StreetsEmpirev2` → production services/database.

Pull requests validate but never deploy. Failed validation leaves the running game
unchanged. Each deployment uses the existing pre-deploy backup, migration, restart,
and health-check process.

## One-time GitHub setup

Create two GitHub Environments in **Settings → Environments**: `beta` and
`production`. Add these four secrets to each environment with that environment's
VPS connection details:

- `VPS_HOST`: VPS hostname or IP address.
- `VPS_USER`: SSH deploy user.
- `VPS_SSH_PRIVATE_KEY`: private half of a dedicated SSH key pair.
- `VPS_SSH_KNOWN_HOSTS`: verified SSH host-key line for the VPS.

Generate the key pair on a trusted machine, add only its public key to the deploy
user's `~/.ssh/authorized_keys`, and save the private key as a GitHub secret. Get
the host-key line with `ssh-keyscan -H <your-vps-host>`, then verify its fingerprint
from the VPS console before saving it. Host-key checking stays enabled.

The VPS deploy account needs access to both checkouts and their `.env` files,
Git access to fetch the repository, Node.js/npm, database access, and permission
for the scripts' service checks/restarts. Configure narrow passwordless sudo rules
for only the relevant systemd units and failure logs, as described in
[DEPLOY.md](DEPLOY.md) and [BETA-DEPLOY.md](BETA-DEPLOY.md).

## Deploy or roll back to a chosen commit

In **Actions → Public Platform → Run workflow**:

1. Choose `beta` or `main`.
2. Leave **commit_sha** blank to use the selected branch's current tip, or enter a
   commit SHA from that branch to deploy a specific version.
3. Run the workflow and watch the validation and deployment jobs.

The selected commit is tested before deployment. The VPS script also verifies that
it is a commit in the selected branch's history. To roll back, choose an earlier
known-good SHA from the same branch. The normal backup, migration, restart, and
health checks still apply. This does not reverse database migrations; use the
database recovery process in [RECOVERY.md](RECOVERY.md) if a rollback requires
restoring data.

## First run

Before relying on automation, test the SSH account from a trusted machine and run
the existing deploy scripts manually once on the VPS. Add the workflow and secret
configuration to both `beta` and `main`. Future pushes will validate and deploy
automatically; manual commit selection is available from the Actions page.
