import { useState } from 'react'
import { Link } from 'react-router-dom'

import type { InsurancePolicy } from '../../domain/types'

export function ClaimSheet({ policies }: { policies: InsurancePolicy[] }) {
  const [visible, setVisible] = useState(false)
  return (
    <section className="card card-body stack">
      <h2>Claim and contact sheet</h2>
      <p>
        Prepare emergency access with your family: tell a trusted person where policy
        documents and a verified encrypted backup can be found. Confirm claim steps with
        each insurer.
      </p>
      <p className="inline-warning">
        Privacy: this sheet reveals policy numbers, nominees and contacts on screen. Close
        it when finished. It is never exported as a plaintext or temporary file;
        screenshots and anyone viewing your device can still capture it.
      </p>
      <button
        type="button"
        className="button button-secondary"
        aria-expanded={visible}
        onClick={() => setVisible((previous) => !previous)}
      >
        {visible ? 'Hide claim/contact sheet' : 'Show claim/contact sheet'}
      </button>
      {visible ? (
        policies.length > 0 ? (
          <ul className="stack" aria-label="Claim and contact sheet">
            {policies.map((policy) => (
              <li key={policy.id}>
                <strong>{policy.policyName}</strong> — {policy.insurer}
                <br />
                Policy number: {policy.policyNumber || 'Not recorded'}
                <br />
                Insured: {policy.coverage?.insuredPeople.join(', ') || 'Not recorded'}
                <br />
                Nominee: {policy.nomineeName || 'Not recorded'}
                <br />
                Claim contact:{' '}
                {policy.coverage?.claimContact || policy.contact || 'Not recorded'}
                <br />
                Documents: {policy.attachmentIds.length} in encrypted app storage
                {policy.coverage?.source === 'employer'
                  ? ' · Employer cover may end on a job change'
                  : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p>
            No active policies recorded. <Link to="/insurance">Add policy details</Link>{' '}
            to make a sheet.
          </p>
        )
      ) : null}
    </section>
  )
}
