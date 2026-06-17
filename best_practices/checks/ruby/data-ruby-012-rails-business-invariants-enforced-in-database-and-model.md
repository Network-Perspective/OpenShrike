---
id: data-ruby-012
title: Rails business invariants are enforced in the database as well as the model
domain: data
language: ruby
app-type: [any]
status: active
sources:
  - type: documentation
    title: RuboCop Rails docs
  - type: book
    title: Sustainable Web Development with Ruby on Rails
    chapter: Chapter 14 "The Database Should Be Designed for Correctness"; Chapter 16 "Validations Don't Provide Data Integrity"
---

# data-ruby-012: Rails business invariants are enforced in the database as well as the model

## Intent
Prevent ordinary Rails writes, background jobs, or non-Rails writers from bypassing important data invariants.

## Applicability
Applies to Active Record models and related migrations. Return `unknown` when the database schema is not visible.

## What to inspect
Validation-skipping write APIs, unique indexes, dangerous column names, and whether critical invariants exist only in Ruby model validations.

## Pass criteria
Normal writes go through validations, important uniqueness and structural invariants are backed by database constraints, and schema names avoid Active Record collisions.

## Fail criteria
Code uses validation-skipping persistence on normal paths, relies on model uniqueness checks without a unique index, or introduces columns that conflict with Active Record behavior.

## Do not flag
Intentional one-off maintenance scripts that explicitly document why validations are bypassed and preserve invariants elsewhere.

## Confidence guidance
`HIGH` when bypass APIs or missing backing indexes are visible. `MEDIUM` when the schema constraint may exist in another migration. `LOW` when only model code changed.

## Remediation
Keep normal writes on validation-safe APIs, add the smallest database constraint that enforces the invariant, and avoid schema names that Active Record treats specially.

## Pass example
```ruby
add_index :users, :email, unique: true
user.save!
```

## Fail example
```ruby
validates :email, uniqueness: true
user.update_columns(email: params[:email])
```
