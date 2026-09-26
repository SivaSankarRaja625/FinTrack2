import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { useState } from 'react'
import { Capacitor } from '@capacitor/core'

import { useFinance } from '../../app/FinanceContext'
import {
  allowedAttachmentTypes,
  hashAttachment,
  MAX_ATTACHMENT_BYTES,
} from '../../data/attachments'
import { todayIso } from '../../domain/dates'
import { newId, nowIso } from '../../domain/id'
import { formatMoney, sumPaise } from '../../domain/money'
import type { AttachmentMeta, InsurancePolicy } from '../../domain/types'
import { downloadBytes } from '../../platform/files'
import { ConfirmDialog } from '../../ui/Dialog'
import { Icon } from '../../ui/Icon'
import { EmptyState, Metric, PageHeader } from '../../ui/Page'
import { useToast } from '../../ui/Toast'
import { PolicyDialog } from './PolicyDialog'
import { coverageFor } from './coverage'

const annualPremiumMultiplier: Record<InsurancePolicy['premiumFrequency'], number> = {
  weekly: 52,
  monthly: 12,
  quarterly: 4,
  'half-yearly': 2,
  yearly: 1,
}

function policyTypeLabel(type: InsurancePolicy['type']) {
  return type
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function InsurancePage() {
  const {
    data,
    attachmentMetadata,
    save,
    remove,
    addAttachment,
    getAttachment,
    deleteAttachment,
  } = useFinance()
  const { notify } = useToast()
  const [policyDialog, setPolicyDialog] = useState<InsurancePolicy | 'new' | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [deletePolicyTarget, setDeletePolicyTarget] = useState<InsurancePolicy | null>(
    null,
  )
  const [deleteDocumentTarget, setDeleteDocumentTarget] = useState<AttachmentMeta | null>(
    null,
  )
  const [uploading, setUploading] = useState(false)
  const selected =
    data.insurancePolicies.find((policy) => policy.id === selectedId) ??
    data.insurancePolicies[0] ??
    null
  const activePolicies = data.insurancePolicies.filter((policy) => policy.active)
  const annualPremiumPaise = sumPaise(
    activePolicies.map(
      (policy) => policy.premiumPaise * annualPremiumMultiplier[policy.premiumFrequency],
    ),
  )
  const dueSoon = activePolicies.filter(
    (policy) =>
      differenceInCalendarDays(parseISO(policy.nextPremiumDate), parseISO(todayIso())) <=
        30 && policy.coverage?.premiumPaidForDate !== policy.nextPremiumDate,
  ).length
  const policyDocuments = selected
    ? attachmentMetadata.filter(
        (attachment) =>
          selected.attachmentIds.includes(attachment.id) &&
          attachment.ownerId === selected.id,
      )
    : []

  const uploadDocument = async (file: File) => {
    if (!selected) return
    setUploading(true)
    let attachmentId: string | null = null
    try {
      if (!allowedAttachmentTypes.has(file.type)) {
        throw new Error('Only PDF, JPEG, PNG, and WebP files are supported')
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        throw new Error('The document exceeds the 20 MB per-file limit')
      }
      const content = new Uint8Array(await file.arrayBuffer())
      attachmentId = newId()
      const metadata: AttachmentMeta = {
        id: attachmentId,
        ownerType: 'insurance',
        ownerId: selected.id,
        filename: file.name,
        mimeType: file.type,
        size: content.byteLength,
        contentHash: await hashAttachment(content),
        createdAt: nowIso(),
      }
      await addAttachment({ metadata, content })
      await save('insurancePolicies', {
        ...selected,
        attachmentIds: [...selected.attachmentIds, attachmentId],
        updatedAt: nowIso(),
      })
      notify('Encrypted document added')
    } catch (error) {
      if (attachmentId) {
        try {
          await deleteAttachment(attachmentId)
        } catch {
          // The encrypted orphan can be cleaned up on the next policy save.
        }
      }
      notify(
        error instanceof Error ? error.message : 'The document could not be added',
        'error',
      )
    } finally {
      setUploading(false)
    }
  }

  const openDocument = async (metadata: AttachmentMeta, download: boolean) => {
    try {
      const attachment = await getAttachment(metadata.id)
      if (!attachment) throw new Error('The encrypted document was not found')
      const bytes = Uint8Array.from(attachment.content)
      if (Capacitor.isNativePlatform()) {
        await downloadBytes(bytes, metadata.filename, metadata.mimeType)
        return
      }
      const url = URL.createObjectURL(
        new Blob([bytes.buffer], { type: metadata.mimeType }),
      )
      const link = document.createElement('a')
      link.href = url
      if (download) {
        link.download = metadata.filename
      } else {
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
      }
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'The document could not be opened',
        'error',
      )
    }
  }

  const confirmDocumentDelete = async () => {
    if (!selected || !deleteDocumentTarget) return
    try {
      await save('insurancePolicies', {
        ...selected,
        attachmentIds: selected.attachmentIds.filter(
          (id) => id !== deleteDocumentTarget.id,
        ),
        updatedAt: nowIso(),
      })
      await deleteAttachment(deleteDocumentTarget.id)
      notify('Document deleted')
      setDeleteDocumentTarget(null)
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'The document could not be deleted',
        'error',
      )
    }
  }

  const confirmPolicyDelete = async () => {
    if (!deletePolicyTarget) return
    try {
      await remove('insurancePolicies', deletePolicyTarget.id)
      await Promise.all(
        deletePolicyTarget.attachmentIds.map((id) => deleteAttachment(id)),
      )
      notify('Policy and its documents deleted')
      if (selectedId === deletePolicyTarget.id) setSelectedId(null)
      setDeletePolicyTarget(null)
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'The policy could not be deleted',
        'error',
      )
    }
  }

  const recordPolicyEvent = async (event: 'premium' | 'renewal') => {
    if (!selected) return
    const coverage = coverageFor(selected)
    try {
      await save('insurancePolicies', {
        ...selected,
        coverage: {
          ...coverage,
          ...(event === 'premium'
            ? { premiumPaidForDate: selected.nextPremiumDate }
            : { renewalConfirmedForDate: selected.renewalDate }),
          lastConfirmedAt: todayIso(),
        },
        updatedAt: nowIso(),
      })
      notify(
        event === 'premium'
          ? 'Premium payment recorded; renewal still needs separate confirmation'
          : 'Policy renewal confirmation recorded',
      )
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'The confirmation could not be saved',
        'error',
      )
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Insurance"
        description="Policy details, premiums, nominees, renewals, and encrypted document copies."
        action={
          <button type="button" className="button" onClick={() => setPolicyDialog('new')}>
            <Icon name="plus" size={17} />
            Add policy
          </button>
        }
      />

      <section className="info-panel backup-exclusion">
        <Icon name="shield" size={20} />
        <div>
          <strong>Documents require a complete manual backup</strong>
          <p>
            Policy files are encrypted locally and included in encrypted .finapp exports.
            Android system backup excludes them because of its limited quota.
          </p>
        </div>
      </section>

      <section className="page-grid metric-group">
        <div className="card card-body span-3">
          <Metric label="Active policies" value={String(activePolicies.length)} />
        </div>
        <div className="card card-body span-3">
          <Metric
            label="Health policies"
            value={String(
              activePolicies.filter((policy) => policy.type === 'health').length,
            )}
          />
        </div>
        <div className="card card-body span-3">
          <Metric
            label="Estimated annual premium"
            value={formatMoney(annualPremiumPaise)}
          />
        </div>
        <div className="card card-body span-3">
          <Metric
            label="Premiums due or overdue"
            value={String(dueSoon)}
            tone={dueSoon > 0 ? 'danger' : 'default'}
          />
        </div>
      </section>

      <section className="card">
        <header className="card-header">
          <div>
            <h2>Policies</h2>
            <p className="muted">
              Cover amounts are informational and excluded from net worth.
            </p>
          </div>
        </header>
        {data.insurancePolicies.length === 0 ? (
          <EmptyState
            title="No insurance policies"
            description="Record essential policy details and renewal dates before adding document copies."
            action={
              <button
                type="button"
                className="button"
                onClick={() => setPolicyDialog('new')}
              >
                Add policy
              </button>
            }
          />
        ) : (
          <ul className="record-list" aria-label="Policies">
            {data.insurancePolicies.map((policy) => (
              <li
                key={policy.id}
                className={`record-item${selected?.id === policy.id ? ' record-item-selected' : ''}`}
              >
                <button
                  type="button"
                  className="record-select"
                  aria-pressed={selected?.id === policy.id}
                  onClick={() => setSelectedId(policy.id)}
                >
                  <span className="record-title-line">
                    <strong>{policy.policyName}</strong>
                    <strong className="tabular">
                      {formatMoney(policy.sumAssuredPaise)} cover
                    </strong>
                  </span>
                  <span className="record-meta">
                    {policyTypeLabel(policy.type)} · {policy.insurer}
                    {policy.policyNumber
                      ? ` · ending ${policy.policyNumber.slice(-4)}`
                      : ''}
                  </span>
                  <span className="record-meta">
                    {policy.active ? 'Active' : 'Inactive'} · Next premium{' '}
                    {format(parseISO(policy.nextPremiumDate), 'dd MMM yyyy')} ·{' '}
                    {formatMoney(policy.premiumPaise)}
                  </span>
                  {policy.coverage?.insuredPeople.length ? (
                    <span className="record-meta">
                      {policy.coverage.insuredPeople.join(', ')}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Edit ${policy.policyName}`}
                  onClick={() => setPolicyDialog(policy)}
                >
                  <Icon name="edit" size={17} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selected ? (
        <section className="page-grid">
          <div className="card span-5">
            <header className="card-header">
              <div>
                <h2>{selected.policyName}</h2>
                <p className="muted">{selected.insurer}</p>
              </div>
              <button
                type="button"
                className="button button-secondary button-small"
                onClick={() => setPolicyDialog(selected)}
              >
                Edit
              </button>
            </header>
            <dl className="detail-list">
              <div>
                <dt>Policy number</dt>
                <dd>{selected.policyNumber || 'Not recorded'}</dd>
              </div>
              <div>
                <dt>Nominee</dt>
                <dd>
                  {selected.nomineeName || 'Not recorded'}
                  {selected.nomineeRelation ? ` · ${selected.nomineeRelation}` : ''}
                </dd>
              </div>
              <div>
                <dt>Renewal</dt>
                <dd>
                  {selected.renewalDate
                    ? format(parseISO(selected.renewalDate), 'dd MMM yyyy')
                    : 'Not recorded'}
                </dd>
              </div>
              <div>
                <dt>Maturity</dt>
                <dd>
                  {selected.maturityDate
                    ? format(parseISO(selected.maturityDate), 'dd MMM yyyy')
                    : 'Not recorded'}
                </dd>
              </div>
              <div>
                <dt>Contact</dt>
                <dd>{selected.contact || 'Not recorded'}</dd>
              </div>
              <div>
                <dt>Cover source</dt>
                <dd>{selected.coverage?.source ?? 'Not recorded'}</dd>
              </div>
              <div>
                <dt>Insured people</dt>
                <dd>{selected.coverage?.insuredPeople.join(', ') || 'Not recorded'}</dd>
              </div>
              <div>
                <dt>Cover layer</dt>
                <dd>{selected.coverage?.layer ?? 'Not recorded'}</dd>
              </div>
              <div>
                <dt>Deductible</dt>
                <dd>
                  {selected.coverage
                    ? formatMoney(selected.coverage.deductiblePaise)
                    : 'Not recorded'}
                </dd>
              </div>
              {selected.coverage?.coPayPercent !== null &&
              selected.coverage?.coPayPercent !== undefined ? (
                <div>
                  <dt>Co-pay</dt>
                  <dd>{selected.coverage.coPayPercent}%</dd>
                </div>
              ) : null}
            </dl>
            {selected.active &&
            selected.renewalDate &&
            selected.renewalDate < todayIso() ? (
              <p className="inline-warning">
                Recorded renewal date passed.{' '}
                {selected.coverage?.renewalConfirmedForDate === selected.renewalDate
                  ? 'Enter the next confirmed renewal date; the previous confirmation does not establish current cover.'
                  : 'Cover status is unconfirmed. Check with the insurer.'}
              </p>
            ) : null}
            {selected.coverage?.restrictions ? (
              <p className="detail-note">{selected.coverage.restrictions}</p>
            ) : null}
            {selected.coverage?.claimContact ? (
              <p className="detail-note">
                Claim contact: {selected.coverage.claimContact}
              </p>
            ) : null}
            {selected.note ? <p className="detail-note">{selected.note}</p> : null}
            {selected.active ? (
              <div className="stack">
                {selected.coverage?.premiumPaidForDate !== selected.nextPremiumDate ? (
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => void recordPolicyEvent('premium')}
                  >
                    Record premium payment
                  </button>
                ) : (
                  <p className="field-hint">
                    Payment recorded for {selected.nextPremiumDate}; verify the insurer
                    also renewed the policy. Edit the policy to enter the next confirmed
                    due date; FinTrack does not advance it automatically.
                  </p>
                )}
                {selected.renewalDate &&
                selected.coverage?.renewalConfirmedForDate !== selected.renewalDate ? (
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => void recordPolicyEvent('renewal')}
                  >
                    Confirm policy renewal
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="card span-7">
            <header className="card-header">
              <div>
                <h2>Encrypted documents</h2>
                <p className="muted">PDF, JPEG, PNG, or WebP; up to 20 MB per file.</p>
              </div>
              <label className={`button button-small${uploading ? ' disabled' : ''}`}>
                <Icon name="upload" size={16} />
                {uploading ? 'Encrypting…' : 'Add document'}
                <input
                  className="sr-only"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                  disabled={uploading}
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) void uploadDocument(file)
                    event.target.value = ''
                  }}
                />
              </label>
            </header>
            {policyDocuments.length === 0 ? (
              <EmptyState
                title="No document copies"
                description="Add the policy schedule or claim document when you are ready."
              />
            ) : (
              <div className="document-list">
                {policyDocuments.map((document) => (
                  <div key={document.id} className="document-row">
                    <Icon name="document" size={20} />
                    <div>
                      <strong>{document.filename}</strong>
                      <span>{formatBytes(document.size)}</span>
                    </div>
                    <div className="cluster cluster-tight">
                      <button
                        type="button"
                        className="button button-secondary button-small"
                        onClick={() => void openDocument(document, false)}
                      >
                        View
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Download ${document.filename}`}
                        onClick={() => void openDocument(document, true)}
                      >
                        <Icon name="download" size={17} />
                      </button>
                      <button
                        type="button"
                        className="icon-button text-danger"
                        aria-label={`Delete ${document.filename}`}
                        onClick={() => setDeleteDocumentTarget(document)}
                      >
                        <Icon name="trash" size={17} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : null}

      {selected ? (
        <section className="danger-zone">
          <div>
            <strong>Remove {selected.policyName}</strong>
            <span>
              This also removes all encrypted documents attached to this policy.
            </span>
          </div>
          <button
            type="button"
            className="button button-danger"
            onClick={() => setDeletePolicyTarget(selected)}
          >
            Delete policy
          </button>
        </section>
      ) : null}

      {policyDialog ? (
        <PolicyDialog
          policy={policyDialog === 'new' ? null : policyDialog}
          onClose={() => setPolicyDialog(null)}
        />
      ) : null}
      <ConfirmDialog
        open={deleteDocumentTarget !== null}
        title="Delete encrypted document?"
        description={`This permanently removes ${deleteDocumentTarget?.filename ?? 'the document'} from local storage and future complete backups.`}
        confirmLabel="Delete document"
        tone="danger"
        onConfirm={() => void confirmDocumentDelete()}
        onClose={() => setDeleteDocumentTarget(null)}
      />
      <ConfirmDialog
        open={deletePolicyTarget !== null}
        title="Delete policy?"
        description={`This permanently removes ${deletePolicyTarget?.policyName ?? 'the policy'} and its encrypted document copies.`}
        confirmLabel="Delete policy"
        tone="danger"
        onConfirm={() => void confirmPolicyDelete()}
        onClose={() => setDeletePolicyTarget(null)}
      />
    </div>
  )
}
