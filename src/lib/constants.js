export const BELTS = [
  { value: 'White Belt', bg: '#FFFFFF', border: '#C9C6BB', text: '#20241F' },
  { value: 'Yellow Belt', bg: '#E8B923', border: '#B5900E', text: '#332600' },
  { value: 'Green Belt', bg: '#3C7A43', border: '#2A5A30', text: '#FFFFFF' },
  { value: 'Blue Belt', bg: '#2B5C8A', border: '#1E4566', text: '#FFFFFF' },
  { value: 'Red Belt', bg: '#9A2B2B', border: '#711F1F', text: '#FFFFFF' },
  { value: 'Black Belt', bg: '#1A1A1A', border: '#000000', text: '#FFFFFF' },
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
