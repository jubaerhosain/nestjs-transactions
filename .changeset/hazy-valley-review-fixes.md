---
'@nestjs-transactions/core': patch
'@nestjs-transactions/typeorm': patch
---

Review fixes: document the transaction lifecycle hooks in the READMEs (the migration
table wrongly said hooks were unsupported), retry the tree-repository detection when
entity metadata is not yet available instead of freezing a wrong "plain" decision,
log hook failures with a proper stack trace, and ship the LICENSE file in the
published tarballs.
