-- A second link between customers and invoices made "invoices -> customers(...)"
-- lookups ambiguous (invoice emails failed with "Invoice not found"). Keep the column, drop the link.
alter table customers drop constraint if exists customers_card_declined_invoice_id_fkey;
notify pgrst, 'reload schema';
