import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient"; // adjust path to your existing Supabase client

export default function AdminRegistrations() {
  const [registrations, setRegistrations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [className, setClassName] = useState("");
  const [tuition, setTuition] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadPending();
  }, []);

  async function loadPending() {
    setLoading(true);
    const { data, error } = await supabase
      .from("registrations")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setRegistrations(data);
    setLoading(false);
  }

  function openReview(reg) {
    setSelected(reg);
    setClassName("");
    setTuition("");
    setError("");
  }

  // Fold any registration info that doesn't have its own column on
  // `students` (emergency contact, medical details, address, referral
  // source, consents, signature) into the free-text notes field so
  // it isn't lost once the registration itself is approved.
  function buildNotes(reg) {
    const lines = [
      `Registered online on ${new Date(reg.created_at).toLocaleDateString()}.`,
      reg.address ? `Address: ${reg.address}, ${reg.city || ""} ${reg.postal_code || ""}`.trim() : null,
      reg.has_medical_condition ? `Medical condition: ${reg.medical_condition_details || "(not specified)"}` : null,
      reg.allergies ? `Allergies: ${reg.allergies}` : null,
      reg.medications ? `Medications: ${reg.medications}` : null,
      reg.doctor_name ? `Doctor: ${reg.doctor_name}${reg.doctor_phone ? " (" + reg.doctor_phone + ")" : ""}` : null,
      reg.health_care_number ? `Health care #: ${reg.health_care_number}` : null,
      reg.emergency_contact_name
        ? `Emergency contact: ${reg.emergency_contact_name}${reg.emergency_contact_relationship ? " (" + reg.emergency_contact_relationship + ")" : ""}${reg.emergency_contact_phone ? " " + reg.emergency_contact_phone : ""}`
        : null,
      `Emergency medical treatment authorized: ${reg.emergency_medical_consent ? "Yes" : "No"}`,
      `Photo/video consent: ${reg.photo_video_consent ? "Yes" : "No"}`,
      `Policy agreed (v${reg.policy_version}), signed "${reg.signed_name}" on ${new Date(reg.signed_at).toLocaleDateString()}.`,
      reg.referral_source ? `Heard about us via: ${reg.referral_source}${reg.referral_other ? " - " + reg.referral_other : ""}` : null,
    ].filter(Boolean);
    return lines.join("\n");
  }

  async function approve(reg) {
    setError("");
    if (!className.trim()) return setError("Please enter a class before approving.");
    if (tuition === "" || isNaN(Number(tuition))) return setError("Please enter a valid monthly tuition amount.");

    const { data: authData } = await supabase.auth.getUser();
    const adminEmail = authData?.user?.email || null;

    // 1. Create the student record, mapped to this portal's actual
    //    `students` schema (single `name`, `dob`, `enroll_date`, etc.)
    const { data: student, error: studentError } = await supabase
      .from("students")
      .insert([
        {
          name: `${reg.first_name} ${reg.last_name}`.trim(),
          dob: reg.date_of_birth,
          guardian_name: reg.guardian_name || null,
          guardian_phone: reg.guardian_phone || null,
          guardian_email: reg.guardian_email || null,
          class_name: className.trim(),
          tuition: Number(tuition),
          enroll_date: new Date().toISOString().slice(0, 10), // today — drives the billing-day calculation
          notes: buildNotes(reg),
        },
      ])
      .select()
      .single();

    if (studentError) {
      setError(studentError.message);
      return;
    }

    // 2. Mark the registration approved and link it to the new student.
    const { error: updateError } = await supabase
      .from("registrations")
      .update({
        status: "approved",
        student_id: student.id,
        reviewed_by: adminEmail,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", reg.id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    // TODO: send an approval email to reg.guardian_email once email is connected
    setSelected(null);
    loadPending();
  }

  async function reject(reg, notes) {
    const { data: authData } = await supabase.auth.getUser();
    const adminEmail = authData?.user?.email || null;

    const { error: updateError } = await supabase
      .from("registrations")
      .update({
        status: "rejected",
        review_notes: notes || null,
        reviewed_by: adminEmail,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", reg.id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    // TODO: send a decline notification email once email is connected
    setSelected(null);
    loadPending();
  }

  if (loading) return <p>Loading registration requests...</p>;

  return (
    <div className="admin-registrations">
      <h1>Registration requests</h1>
      {error && <p className="form-error">{error}</p>}

      {registrations.length === 0 ? (
        <p>No pending registrations.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Submitted</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {registrations.map((reg) => (
              <tr key={reg.id}>
                <td>{reg.first_name} {reg.last_name}</td>
                <td>{reg.applicant_type}</td>
                <td>{new Date(reg.created_at).toLocaleString()}</td>
                <td>
                  <button onClick={() => openReview(reg)}>Review</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selected && (
        <div className="review-modal">
          <h2>{selected.first_name} {selected.last_name}</h2>
          <pre className="review-json">{JSON.stringify(selected, null, 2)}</pre>

          <fieldset>
            <legend>Assign class &amp; tuition (required to approve)</legend>
            <label>Class
              <input value={className} onChange={(e) => setClassName(e.target.value)} placeholder="e.g. Tue/Thu 6pm" />
            </label>
            <label>Monthly tuition
              <input type="number" value={tuition} onChange={(e) => setTuition(e.target.value)} placeholder="e.g. 150" />
            </label>
          </fieldset>

          <div className="modal-actions">
            <button onClick={() => approve(selected)}>Approve → create student</button>
            <button
              onClick={() => {
                const notes = window.prompt("Reason for rejecting (optional):") || "";
                reject(selected, notes);
              }}
            >
              Reject
            </button>
            <button onClick={() => setSelected(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
