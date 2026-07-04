#!/usr/bin/env bash
set -euo pipefail

WOA_REMOTE="${WOA_REMOTE:-woa}"
WOA_BRANCH="${WOA_BRANCH:-main}"
WOA_NAME="${WOA_NAME:-shaoyouwang}"
WOA_EMAIL="${WOA_EMAIL:-shaoyouwang@tencent.com}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

current_branch="$(git branch --show-current)"
if [ "$current_branch" != "$WOA_BRANCH" ]; then
  echo "Expected to be on branch ${WOA_BRANCH}, currently on ${current_branch:-detached}." >&2
  exit 1
fi

git fetch "$WOA_REMOTE" "$WOA_BRANCH"

if ! git rev-parse --verify "${WOA_REMOTE}/${WOA_BRANCH}" >/dev/null 2>&1; then
  echo "Remote ref ${WOA_REMOTE}/${WOA_BRANCH} not found." >&2
  exit 1
fi

main_tree="$(git rev-parse HEAD^{tree})"
woa_tree="$(git rev-parse "${WOA_REMOTE}/${WOA_BRANCH}^{tree}")"

if [ "$main_tree" = "$woa_tree" ]; then
  echo "Nothing to push to ${WOA_REMOTE} (trees match)."
  exit 0
fi

tmp_branch="woa-push-$$"
trap 'git checkout -f "$current_branch" >/dev/null 2>&1; git branch -D "$tmp_branch" >/dev/null 2>&1 || true' EXIT

git branch -f "$tmp_branch" "${WOA_REMOTE}/${WOA_BRANCH}"
git checkout "$tmp_branch"

git read-tree -u -m HEAD "$main_tree"

if git diff --cached --quiet && git diff --quiet; then
  echo "Nothing to push to ${WOA_REMOTE}."
  exit 0
fi

commit_msg="$(git log --reverse --format=%B "${WOA_REMOTE}/${WOA_BRANCH}"..HEAD | sed '/^$/d' | head -c 10000)"
if [ -z "$commit_msg" ]; then
  commit_msg="$(git log -1 --format=%B HEAD)"
fi

git -c user.name="$WOA_NAME" -c user.email="$WOA_EMAIL" \
  commit -m "$commit_msg"

git push "$WOA_REMOTE" "${tmp_branch}:${WOA_BRANCH}"
echo "Pushed to ${WOA_REMOTE}/${WOA_BRANCH} with ${WOA_EMAIL}."
