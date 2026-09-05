import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { StatusPanel } from '../components/StatusPanel';
import { Badge } from '../design-system/Badge';
import { Banner } from '../design-system/Banner';
import { Button } from '../design-system/Button';
import { Card } from '../design-system/Card';
import { Chip } from '../design-system/Chip';
import { Field } from '../design-system/Field';
import { addressesApi, type SavedAddress } from '../lib/api';
import {
  ADDRESS_COPY,
  ADDRESS_LABEL_CHIPS,
  addressLoadState,
  applyLabelChip,
  buildAddressWrite,
  cancelDeleteConfirm,
  draftFromAddress,
  emptyAddressDraft,
  formatAddressLines,
  openDeleteConfirm,
  selectedLabelChip,
  type AddressDraft,
  type DeleteConfirmState,
} from '../lib/addresses';
import { isAuthenticated } from '../lib/session';

export function AddressesScreen() {
  const [rows, setRows] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [draft, setDraft] = useState<AddressDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<DeleteConfirmState>(cancelDeleteConfirm());
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!isAuthenticated()) {
      setRows([]);
      setError(ADDRESS_COPY.signIn);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await addressesApi.list();
      setRows(res.data);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : 'Could not load addresses');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const view = addressLoadState({
    authenticated: isAuthenticated(),
    loading,
    error,
    count: rows.length,
  });

  function startAdd() {
    setEditingId(null);
    setDraft(emptyAddressDraft(rows.length === 0));
    setFormError(null);
    setSuccess(null);
  }

  function startEdit(address: SavedAddress) {
    setEditingId(address.id);
    setDraft(draftFromAddress(address));
    setFormError(null);
    setSuccess(null);
  }

  function closeForm() {
    setDraft(null);
    setEditingId(null);
    setFormError(null);
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const write = buildAddressWrite(draft);
    if ('error' in write) {
      setFormError(write.error);
      return;
    }
    setSaving(true);
    setFormError(null);
    setSuccess(null);
    try {
      if (editingId) await addressesApi.patch(editingId, write);
      else await addressesApi.create(write);
      const res = await addressesApi.list();
      setRows(res.data);
      closeForm();
      setSuccess(ADDRESS_COPY.saved);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save address');
    } finally {
      setSaving(false);
    }
  }

  async function onConfirmDelete() {
    if (!confirm.addressId) return;
    setDeleting(true);
    setFormError(null);
    setSuccess(null);
    try {
      await addressesApi.remove(confirm.addressId);
      const res = await addressesApi.list();
      setRows(res.data);
      if (editingId === confirm.addressId) closeForm();
      setConfirm(cancelDeleteConfirm());
      setSuccess(ADDRESS_COPY.deleted);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not delete address');
    } finally {
      setDeleting(false);
    }
  }

  const labelChip = draft ? selectedLabelChip(draft.label) : null;

  return (
    <section>
      <p>
        <Link to="/profile">← Profile</Link>
      </p>
      <h1>{ADDRESS_COPY.title}</h1>
      <p className="lede">{ADDRESS_COPY.lede}</p>
      {!isAuthenticated() ? (
        <Banner tone="error">
          <p>{ADDRESS_COPY.signIn}</p>
          <p>
            <Link to="/login?next=/addresses">Sign in</Link>
          </p>
        </Banner>
      ) : (
        <>
          {success ? <Banner tone="success">{success}</Banner> : null}
          <div className="form-actions">
            <Button type="button" onClick={startAdd}>
              {ADDRESS_COPY.add}
            </Button>
          </div>
          {draft ? (
            <Card as="form" onSubmit={(e) => void onSave(e)}>
              <h2>{editingId ? ADDRESS_COPY.edit : ADDRESS_COPY.add}</h2>
              {formError ? <Banner tone="error">{formError}</Banner> : null}
              <div className="chip-rail chip-wrap" role="group" aria-label="Address label">
                {ADDRESS_LABEL_CHIPS.map((chip) => (
                  <Chip
                    key={chip}
                    selected={labelChip === chip}
                    onClick={() => setDraft(applyLabelChip(draft, chip))}
                  >
                    {chip}
                  </Chip>
                ))}
              </div>
              {labelChip === 'Other' ? (
                <Field label="Label">
                  <input
                    value={draft.label}
                    onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                    placeholder="Other"
                  />
                </Field>
              ) : null}
              <Field label="Address line">
                <input
                  value={draft.line1}
                  onChange={(e) => setDraft({ ...draft, line1: e.target.value })}
                  required
                  autoComplete="address-line1"
                />
              </Field>
              <Field label="Address line 2">
                <input
                  value={draft.line2}
                  onChange={(e) => setDraft({ ...draft, line2: e.target.value })}
                  autoComplete="address-line2"
                />
              </Field>
              <Field label="City">
                <input
                  value={draft.city}
                  onChange={(e) => setDraft({ ...draft, city: e.target.value })}
                  autoComplete="address-level2"
                />
              </Field>
              <Field label="State">
                <input
                  value={draft.state}
                  onChange={(e) => setDraft({ ...draft, state: e.target.value })}
                  autoComplete="address-level1"
                />
              </Field>
              <Field label="PIN code">
                <input
                  value={draft.pinCode}
                  onChange={(e) => setDraft({ ...draft, pinCode: e.target.value })}
                  autoComplete="postal-code"
                />
              </Field>
              <Field label={ADDRESS_COPY.defaultLabel}>
                <input
                  type="checkbox"
                  checked={draft.isDefault}
                  onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })}
                />
              </Field>
              <div className="form-actions">
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
                <Button type="button" variant="secondary" onClick={closeForm} disabled={saving}>
                  Cancel
                </Button>
              </div>
            </Card>
          ) : null}
          {confirm.open ? (
            <Card role="dialog" aria-modal="true" aria-labelledby="delete-address-title">
              <h2 id="delete-address-title">{ADDRESS_COPY.deleteTitle}</h2>
              {formError ? <Banner tone="error">{formError}</Banner> : null}
              <div className="form-actions">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setConfirm(cancelDeleteConfirm())}
                  disabled={deleting}
                >
                  {ADDRESS_COPY.deleteCancel}
                </Button>
                <Button type="button" onClick={() => void onConfirmDelete()} disabled={deleting}>
                  {deleting ? 'Deleting…' : ADDRESS_COPY.deleteConfirm}
                </Button>
              </div>
            </Card>
          ) : null}
          <StatusPanel
            loading={view.kind === 'loading'}
            error={view.kind === 'error' ? view.message : null}
            empty={view.kind === 'empty' && !draft ? view.message : null}
            onRetry={() => void load()}
          >
            {view.kind === 'ready'
              ? rows.map((row) => (
                  <Card key={row.id}>
                    <div className="row">
                      <div>
                        <h2>
                          {row.label || 'Address'}{' '}
                          {row.isDefault ? (
                            <Badge tone="info">{ADDRESS_COPY.defaultBadge}</Badge>
                          ) : null}
                        </h2>
                        <p className="lede">{formatAddressLines(row)}</p>
                      </div>
                      <div className="row-actions">
                        <Button type="button" variant="secondary" onClick={() => startEdit(row)}>
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setConfirm(openDeleteConfirm(row.id))}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))
              : null}
          </StatusPanel>
        </>
      )}
    </section>
  );
}
