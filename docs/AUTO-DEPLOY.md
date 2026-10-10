# Automatic VPS deployments

A push to `beta` or `main` now runs the public-platform validation workflow.
After typechecking, tests, migrations in a disposable CI database, and the full build
pass, the workflow connects to the VPS and runs that branch's existing deployment
script:

- `beta` → `/opt/streets-empire/StreetsEmpirev2-beta` →
  `scripts/ops/deploy-beta.sh`
- `main` → `/opt/streets-empire/StreetsEmpirev2` →
  `scripts/ops/deploy.sh`

Pull requests run validation but never deploy. A failed validation keeps the live
game unchanged. The deploy scripts still take their pre-deploy backup, apply
migrations, restart the correct services, and check the deployed environment.

## One-time GitHub setup

Create two GitHub Environments in **Settings → Environments**: `beta` and
`production`. Add these four secrets to each environment, using values for that
environment's authorized VPS deploy account:

- `VPS_HOST`: VPS hostname or IP address.
- `VPS_USER`: SSH deploy user.
- `VPS_SSH_PRIVATE_KEY`: private half of a dedicated SSH key pair.
- `VPS_SSH_KNOWN_HOSTS`: the verified SSH host-key line for this VPS.

Use the same VPS endpoint if both deployments share the server, but keep the private
key restricted to a deploy account. Generate the key pair on a trusted machine,
install only its public key in the deploy user's `~/.ssh/authorized_keys`, and
store the private key as the GitHub secret. Get the host-key line with
`ssh-keyscan -H <your-vps-host>`, then verify its fingerprint from the VPS console
before saving it. Do not disable host-key checking.

The VPS deploy account needs:

- access to both existing checkouts and their configured `.env` files;
- working Git access to fetch the repository branches;
- Node.js/npm and the database access used by each checkout;
- permission to run the deploy scripts' service checks and restarts.

The scripts use `sudo` for service restarts and failure logs. Configure narrow
passwordless sudo rules for the relevant units as described in
[DEPLOY.md](DEPLOY.md); add the beta units from [BETA-DEPLOY.md](BETA-DEPLOY.md)
as well. Do not grant the deploy user unrestricted root access.

## First run

Before relying on automation, test the SSH account from a trusted machine and run
the existing deploy scripts manually once on the VPS. Then merge this workflow to
`beta` and `main`. The next push to either branch will validate first and deploy
that branch automatically. Watch **Actions → Public Platform** for the validation
and deploy logs.
