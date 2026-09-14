// Belt progression, lightest to most senior. "Stripe" ranks are shown as a
// half-and-half gradient between the current and next belt color, matching
// how a striped belt actually looks. Junior black-stripe ranks (pre-Dan) use
// plain black; Dan ranks get a gold border to set them apart.
export const BELTS = [
  { value: 'White', bg: '#FFFFFF', border: '#C9C6BB', text: '#20241F' },
  { value: 'Yellow Stripe', bg: 'linear-gradient(90deg, #FFFFFF 50%, #E8B923 50%)', border: '#C9C6BB', text: '#332600' },
  { value: 'Yellow', bg: '#E8B923', border: '#B5900E', text: '#332600' },
  { value: 'Green Stripe', bg: 'linear-gradient(90deg, #E8B923 50%, #3C7A43 50%)', border: '#B5900E', text: '#FFFFFF' },
  { value: 'Green', bg: '#3C7A43', border: '#2A5A30', text: '#FFFFFF' },
  { value: 'Blue Stripe', bg: 'linear-gradient(90deg, #3C7A43 50%, #2B5C8A 50%)', border: '#2A5A30', text: '#FFFFFF' },
  { value: 'Blue', bg: '#2B5C8A', border: '#1E4566', text: '#FFFFFF' },
  { value: 'Red Stripe', bg: 'linear-gradient(90deg, #2B5C8A 50%, #9A2B2B 50%)', border: '#1E4566', text: '#FFFFFF' },
  { value: 'Red', bg: '#9A2B2B', border: '#711F1F', text: '#FFFFFF' },
  { value: 'Black Stripe', bg: 'linear-gradient(90deg, #9A2B2B 50%, #1A1A1A 50%)', border: '#711F1F', text: '#FFFFFF' },
  { value: 'Black Stripe 1', bg: '#1A1A1A', border: '#000000', text: '#FFFFFF' },
  { value: 'Black Stripe 2', bg: '#1A1A1A', border: '#000000', text: '#FFFFFF' },
  { value: 'Black Stripe 3', bg: '#1A1A1A', border: '#000000', text: '#FFFFFF' },
  { value: 'Black Stripe 4', bg: '#1A1A1A', border: '#000000', text: '#FFFFFF' },
  { value: 'Black Belt 1st Dan', bg: '#1A1A1A', border: '#D4AF37', text: '#FFFFFF' },
  { value: 'Black Belt 2nd Dan', bg: '#1A1A1A', border: '#D4AF37', text: '#FFFFFF' },
  { value: 'Black Belt 3rd Dan', bg: '#1A1A1A', border: '#D4AF37', text: '#FFFFFF' },
];

export const LEAD_SOURCES = ['Phone', 'Walk-in', 'Online', 'Referral', 'Other'];

export const LEAD_STATUSES = [
  { value: 'New Inquiry', bg: '#F1EFE7', text: '#5B5F56', border: '#DEDACC' },
  { value: 'Consultation Scheduled', bg: '#E6F0F6', text: '#1E4566', border: '#B9D3E4' },
  { value: 'Consultation Done', bg: '#FAEEDA', text: '#854F0B', border: '#F0D9A8' },
  { value: 'Enrolled', bg: '#E8F1E9', text: '#2A5A30', border: '#BFDCC3' },
  { value: 'Not Enrolled', bg: '#FBEAEA', text: '#9A2B2B', border: '#E4B8B8' },
];

export const TRYOUT_STATUSES = [
  { value: 'Scheduled', bg: '#E6F0F6', text: '#1E4566', border: '#B9D3E4' },
  { value: 'Attended', bg: '#E8F1E9', text: '#2A5A30', border: '#BFDCC3' },
  { value: 'No-show', bg: '#FBEAEA', text: '#9A2B2B', border: '#E4B8B8' },
  { value: 'Converted', bg: '#FAEEDA', text: '#854F0B', border: '#F0D9A8' },
];

export const MAKEUP_STATUSES = {
  pending: { label: 'Not Scheduled', bg: '#F1EFE7', text: '#5B5F56', border: '#DEDACC' },
  reserved: { label: 'Reserved', bg: '#E6F0F6', text: '#1E4566', border: '#B9D3E4' },
  completed: { label: 'Completed', bg: '#E8F1E9', text: '#2A5A30', border: '#BFDCC3' },
  expired: { label: 'Expired', bg: '#FBEAEA', text: '#9A2B2B', border: '#E4B8B8' },
};

export function formatCurrency(n) {
  const num = Number(n);
  if (!num) return '₩0';
  return '₩' + num.toLocaleString('en-US');
}
