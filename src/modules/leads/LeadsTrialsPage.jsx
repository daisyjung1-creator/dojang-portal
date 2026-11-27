import React from 'react';
import LeadsPage from './LeadsPage';
import TryoutsPage from '../tryouts/TryoutsPage';
import { useAuth } from '../../auth/AuthContext';

// Leads & Trials. Admin: one list — each inquiry shows its trial bookings
// (a trial booking is an inquiry too). The address may still be #leads or
// #tryouts so old links keep working. Staff only see the Trials list.
export default function LeadsTrialsPage({ setActiveTab }) {
  const { isAdmin } = useAuth();
  return isAdmin ? <LeadsPage setActiveTab={setActiveTab} /> : <TryoutsPage setActiveTab={setActiveTab} />;
}
