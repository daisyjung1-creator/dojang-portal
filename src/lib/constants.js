// Belt progression, lightest to most senior. "Stripe" ranks are the belt colour
// with the next colour as a stripe along the middle, like the real belt
// (black stripes: red belt, black stripe). Dan ranks get a gold border.
export const BELTS = [
  { value: 'White', bg: '#FFFFFF', border: '#C9C6BB', text: '#20241F' },
  { value: 'Yellow Stripe', bg: 'linear-gradient(180deg, #FFFFFF 34%, #E8B923 34%, #E8B923 66%, #FFFFFF 66%)', border: '#C9C6BB', text: '#332600' },
  { value: 'Yellow', bg: '#E8B923', border: '#B5900E', text: '#332600' },
  { value: 'Green Stripe', bg: 'linear-gradient(180deg, #E8B923 34%, #3C7A43 34%, #3C7A43 66%, #E8B923 66%)', border: '#B5900E', text: '#FFFFFF' },
  { value: 'Green', bg: '#3C7A43', border: '#2A5A30', text: '#FFFFFF' },
  { value: 'Blue Stripe', bg: 'linear-gradient(180deg, #3C7A43 34%, #2B5C8A 34%, #2B5C8A 66%, #3C7A43 66%)', border: '#2A5A30', text: '#FFFFFF' },
  { value: 'Blue', bg: '#2B5C8A', border: '#1E4566', text: '#FFFFFF' },
  { value: 'Red Stripe', bg: 'linear-gradient(180deg, #2B5C8A 34%, #9A2B2B 34%, #9A2B2B 66%, #2B5C8A 66%)', border: '#1E4566', text: '#FFFFFF' },
  { value: 'Red', bg: '#9A2B2B', border: '#711F1F', text: '#FFFFFF' },
  { value: 'Black Stripe', bg: 'linear-gradient(180deg, #9A2B2B 34%, #1A1A1A 34%, #1A1A1A 66%, #9A2B2B 66%)', border: '#711F1F', text: '#FFFFFF' },
  { value: 'Black Stripe 1', bg: 'linear-gradient(180deg, #9A2B2B 34%, #1A1A1A 34%, #1A1A1A 66%, #9A2B2B 66%)', border: '#711F1F', text: '#FFFFFF' },
  { value: 'Black Stripe 2', bg: 'linear-gradient(180deg, #9A2B2B 34%, #1A1A1A 34%, #1A1A1A 66%, #9A2B2B 66%)', border: '#711F1F', text: '#FFFFFF' },
  { value: 'Black Stripe 3', bg: 'linear-gradient(180deg, #9A2B2B 34%, #1A1A1A 34%, #1A1A1A 66%, #9A2B2B 66%)', border: '#711F1F', text: '#FFFFFF' },
  { value: 'Black Stripe 4', bg: 'linear-gradient(180deg, #9A2B2B 34%, #1A1A1A 34%, #1A1A1A 66%, #9A2B2B 66%)', border: '#711F1F', text: '#FFFFFF' },
  { value: 'Black Belt 1st Dan', bg: '#1A1A1A', border: '#D4AF37', text: '#FFFFFF' },
  { value: 'Black Belt 2nd Dan', bg: '#1A1A1A', border: '#D4AF37', text: '#FFFFFF' },
  { value: 'Black Belt 3rd Dan', bg: '#1A1A1A', border: '#D4AF37', text: '#FFFFFF' },
];

export const LEAD_SOURCES = ['Phone', 'Walk-in', 'Online', 'Referral', 'Other'];

// Status chips use the design-token colours (DESIGN.md); screen use only.
export const LEAD_STATUSES = [
  { value: 'New Inquiry', bg: 'var(--dp-canvas)', text: 'var(--dp-ink-soft)', border: 'var(--dp-line)' },
  { value: 'Consultation Scheduled', label: 'Trial Booked', bg: 'var(--dp-canvas)', text: 'var(--dp-info)', border: 'var(--dp-line)' },
  { value: 'Consultation Done', label: 'Trial Done', bg: 'var(--dp-warning-tint)', text: 'var(--dp-warning)', border: 'var(--dp-warning-tint)' },
  { value: 'Enrolled', bg: 'var(--dp-success-tint)', text: 'var(--dp-success)', border: 'var(--dp-success-tint)' },
  { value: 'Not Enrolled', bg: 'var(--dp-danger-tint)', text: 'var(--dp-danger)', border: 'var(--dp-danger-tint)' },
];

export const TRYOUT_STATUSES = [
  { value: 'Scheduled', bg: 'var(--dp-canvas)', text: 'var(--dp-info)', border: 'var(--dp-line)' },
  { value: 'Attended', bg: 'var(--dp-success-tint)', text: 'var(--dp-success)', border: 'var(--dp-success-tint)' },
  { value: 'No-show', bg: 'var(--dp-danger-tint)', text: 'var(--dp-danger)', border: 'var(--dp-danger-tint)' },
  { value: 'Converted', bg: 'var(--dp-warning-tint)', text: 'var(--dp-warning)', border: 'var(--dp-warning-tint)' },
  { value: 'Not joining', bg: 'var(--dp-canvas)', text: 'var(--dp-ink-soft)', border: 'var(--dp-line)' },
];

export const MAKEUP_STATUSES = {
  pending: { label: 'Not Scheduled', bg: 'var(--dp-canvas)', text: 'var(--dp-ink-soft)', border: 'var(--dp-line)' },
  reserved: { label: 'Reserved', bg: 'var(--dp-canvas)', text: 'var(--dp-info)', border: 'var(--dp-line)' },
  completed: { label: 'Completed', bg: 'var(--dp-success-tint)', text: 'var(--dp-success)', border: 'var(--dp-success-tint)' },
  expired: { label: 'Expired', bg: 'var(--dp-danger-tint)', text: 'var(--dp-danger)', border: 'var(--dp-danger-tint)' },
};

export function formatCurrency(n) {
  const num = Number(n) || 0;
  return '$' + num.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
