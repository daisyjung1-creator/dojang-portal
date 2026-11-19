#!/bin/sh
# Copies the tuition billing rules into the td-pay edge function (used by the
# daily automatic tuition run). Run after changing billingDates.js,
# invoiceUtils.js or tuitionBilling.js, then redeploy td-pay.
cd "$(dirname "$0")/.." && F=supabase/functions/td-pay/billing.js && {
echo "// Copied from src/lib/billingDates.js, src/lib/invoiceUtils.js and src/lib/tuitionBilling.js"
echo "// (same rules as the Billing page). Regenerate with scripts/sync-edge-billing.sh after changing those."
echo "// @ts-nocheck"
cat src/lib/billingDates.js
sed -n '/^const moneyFmt/,/^export function round2/{/^export function round2/!p}' src/lib/invoiceUtils.js
sed -n '/^export function round2/,/^}/p' src/lib/invoiceUtils.js
sed -n '/^export function formatDate/,/^}/p;/^export function lineAmount/,/^}/p;/^export function calcTotals/,/^}/p' src/lib/invoiceUtils.js
grep -v "^import " src/lib/tuitionBilling.js | sed '/^export function classesLabel/,/^}/d'
} > $F && echo "wrote $F"
