// Unit tests for the manual email update (mailto builder) and the
// notification recipient logic of the sample-request pipeline.

import { describe, it, expect } from 'vitest'
import { buildRequestEmailUrl, buildRecipientList } from '../requestEmail'
import { requestParticipantUids, newRequestRecipients } from '../requestNotifications'

const baseRequest = {
  title: 'Spring bouquet samples',
  teamName: 'Publix Team',
  bucket: 'Samples Ship Out',
  status: 'handed_to_shipping' as const,
  orderNumber: 'PO-4471',
  awbNumber: '729-12345675',
}

describe('buildRecipientList', () => {
  it('dedupes, lowercases and drops empties', () => {
    expect(buildRecipientList(['Sean@eliteflower.com', 'sean@eliteflower.com', '', null, 'am@eliteflower.com']))
      .toBe('sean@eliteflower.com,am@eliteflower.com')
  })
})

describe('buildRequestEmailUrl', () => {
  const fields = {
    date: '2026-06-12',
    truck: 'Armellini #42',
    clientName: 'Publix',
    extraNotes: 'Flower arrived, NPD finished — pallet handed to shipping.',
  }
  const url = buildRequestEmailUrl(baseRequest, 'sean@eliteflower.com', fields)

  it('targets the recipients and is a valid mailto URL', () => {
    expect(url.startsWith('mailto:sean@eliteflower.com?subject=')).toBe(true)
  })

  it('subject carries the title and human-readable status', () => {
    const subject = decodeURIComponent(url.split('subject=')[1].split('&body=')[0])
    expect(subject).toBe('[NPD Planner] Spring bouquet samples — Handed to Shipping')
  })

  it('body includes every operational field Carlos listed (date, truck, client)', () => {
    const body = decodeURIComponent(url.split('&body=')[1])
    expect(body).toContain('Date: 2026-06-12')
    expect(body).toContain('Truck / Carrier: Armellini #42')
    expect(body).toContain('Client: Publix')
    expect(body).toContain('Order #: PO-4471')
    expect(body).toContain('AWB: 729-12345675')
    expect(body).toContain('pallet handed to shipping')
  })

  it('omits empty order/AWB lines instead of printing blanks', () => {
    const bare = buildRequestEmailUrl(
      { ...baseRequest, orderNumber: '', awbNumber: '' },
      'a@eliteflower.com',
      { ...fields, extraNotes: '' }
    )
    const body = decodeURIComponent(bare.split('&body=')[1])
    expect(body).not.toContain('Order #:')
    expect(body).not.toContain('AWB:')
  })
})

describe('request notification recipients', () => {
  const req = {
    createdBy: 'u-sean',
    assignedManagers: ['u-am1', 'u-am2'],
    helpers: ['u-helper', 'u-am1'],  // overlap on purpose
  }

  it('notifies everyone involved exactly once, never the actor', () => {
    expect(requestParticipantUids(req, 'u-am1').sort())
      .toEqual(['u-am2', 'u-helper', 'u-sean'])
    expect(requestParticipantUids(req, 'u-sean')).not.toContain('u-sean')
  })

  it('new requests go to NPD admins, excluding an admin who filed it', () => {
    expect(newRequestRecipients(['u-carlos', 'u-admin2'], 'u-sean'))
      .toEqual(['u-carlos', 'u-admin2'])
    expect(newRequestRecipients(['u-carlos', 'u-admin2', 'u-carlos'], 'u-carlos'))
      .toEqual(['u-admin2'])
  })
})
