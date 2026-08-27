"""
CLI for adding/listing/removing operator accounts (backend/db.py's
`operators` table) -- deliberately NOT a web endpoint. Account creation
isn't exposed through the app itself: this is "local prototype-grade"
scope (see top-level README's App-hardening section) where whoever has
filesystem access to this machine is already trusted to run the backend
at all, so a terminal command is the right amount of ceremony -- no
in-app self-registration flow, and no "any operator can create another"
question to answer, either.

Usage:
    python manage_operators.py add <username> [password]
        Creates an operator. If password is omitted, one is generated and
        printed once (same convention as auth.bootstrap_default_operator).
    python manage_operators.py list
        Lists existing operators (username + created_at), never password hashes.
    python manage_operators.py passwd <username> <new_password>
        Resets an existing operator's password.
    python manage_operators.py remove <username>
        Deletes an operator account. Their past predictions in history
        stay (operator_id becomes an orphaned reference, same as deleting
        a staff record doesn't erase the clinical history they created) --
        deliberately not a cascading delete.
"""
import secrets
import sys
import time

import auth
import db


def cmd_add(args):
    if not args:
        print("Usage: python manage_operators.py add <username> [password]")
        sys.exit(1)
    username = args[0]
    if db.get_operator_by_username(username) is not None:
        print(f"Operator '{username}' already exists.")
        sys.exit(1)

    password = args[1] if len(args) > 1 else None
    generated = password is None
    if generated:
        password = secrets.token_urlsafe(12)

    password_hash, salt = auth.hash_password(password)
    operator_id = db.create_operator(username, password_hash, salt)

    print(f"Created operator '{username}' (id={operator_id}).")
    if generated:
        print(f"Generated password (save this now, it is not stored anywhere else): {password}")


def cmd_list(args):
    with db.get_conn() as conn:
        rows = conn.execute("SELECT id, username, created_at FROM operators ORDER BY id").fetchall()
    if not rows:
        print("No operators yet -- start the backend once to auto-create the default account, or use 'add'.")
        return
    print(f"{'id':>4}  {'username':<20}  created_at")
    for r in rows:
        created = time.strftime("%Y-%m-%d %H:%M", time.localtime(r["created_at"]))
        print(f"{r['id']:>4}  {r['username']:<20}  {created}")


def cmd_passwd(args):
    if len(args) < 2:
        print("Usage: python manage_operators.py passwd <username> <new_password>")
        sys.exit(1)
    username, new_password = args[0], args[1]
    operator = db.get_operator_by_username(username)
    if operator is None:
        print(f"No such operator: '{username}'")
        sys.exit(1)
    password_hash, salt = auth.hash_password(new_password)
    with db.get_conn() as conn:
        conn.execute(
            "UPDATE operators SET password_hash = ?, salt = ? WHERE id = ?",
            (password_hash, salt, operator["id"]),
        )
    print(f"Password updated for '{username}'.")


def cmd_remove(args):
    if not args:
        print("Usage: python manage_operators.py remove <username>")
        sys.exit(1)
    username = args[0]
    operator = db.get_operator_by_username(username)
    if operator is None:
        print(f"No such operator: '{username}'")
        sys.exit(1)
    with db.get_conn() as conn:
        conn.execute("DELETE FROM operators WHERE id = ?", (operator["id"],))
    print(f"Removed operator '{username}'. Their past predictions in history are kept, not deleted.")


COMMANDS = {"add": cmd_add, "list": cmd_list, "passwd": cmd_passwd, "remove": cmd_remove}

if __name__ == "__main__":
    db.init_db()
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        print(__doc__)
        sys.exit(1)
    COMMANDS[sys.argv[1]](sys.argv[2:])
