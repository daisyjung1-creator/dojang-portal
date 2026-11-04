import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient';
import SearchSelect from '../../components/SearchSelect';

let studentCache = null;
function loadStudents() {
  if (!studentCache) {
    studentCache = supabase
      .from('students')
      .select('name, customer_id, status')
      .then(({ data }) => data || [])
      .catch(() => {
        studentCache = null;
        return [];
      });
  }
  return studentCache;
}

// Customer chooser you can type into. Finds a family by the customer name,
// any of its students' names, email or phone — and copes with typos.
export default function CustomerPicker({ customers, value, onChange, disabled, includeInactive = true }) {
  const [students, setStudents] = useState([]);
  useEffect(() => {
    let live = true;
    loadStudents().then((s) => live && setStudents(s));
    return () => {
      live = false;
    };
  }, []);

  const options = useMemo(() => {
    const kids = {};
    students.forEach((s) => {
      if (!s.customer_id) return;
      (kids[s.customer_id] ||= []).push(s.name);
    });
    return customers
      .filter((c) => includeInactive || c.active !== false || c.id === value)
      .map((c) => {
        const names = kids[c.id] || [];
        const extra = names.filter((n) => !c.name.includes(n));
        return {
          value: c.id,
          label: c.name + (c.active === false ? ' (inactive)' : ''),
          hint: [extra.length ? 'Students: ' + extra.join(', ') : '', c.email].filter(Boolean).join(' · '),
          keywords: [...names, c.email, c.phone, c.contact_name].filter(Boolean).join(' '),
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [customers, students, value, includeInactive]);

  return <SearchSelect options={options} value={value || ''} onChange={onChange} disabled={disabled} placeholder="Type a name, student, email…" style={{ flex: 1, minWidth: 0 }} />;
}
