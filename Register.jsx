import { useState } from "react";
import { supabase } from "../lib/supabaseClient"; // adjust path to your existing Supabase client

const POLICY_VERSION = "v1"; // bump this whenever you edit the policy text below

const STEPS = [
  "Applicant type",
  "Applicant details",
  "Parent/guardian",
  "Emergency medical",
  "Policies",
  "Signature",
  "Review",
];

const emptyForm = {
  applicant_type: "",
  first_name: "",
  last_name: "",
  date_of_birth: "",
  has_medical_condition: false,
  medical_condition_details: "",
  allergies: "",
  medications: "",
  doctor_name: "",
  doctor_phone: "",
  health_care_number: "",
  guardian_name: "",
  guardian_phone: "",
  guardian_email: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  emergency_contact_relationship: "",
  address: "",
  city: "",
  postal_code: "",
  referral_source: "",
  referral_other: "",
  emergency_medical_consent: null, // true / false
  photo_video_consent: null, // true / false
  policy_agreed: false,
  signed_name: "",
};

export default function Register() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const update = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const isMinor = form.applicant_type === "minor";

  function next() {
    setError("");
    // minimal per-step validation — expand as needed
    if (step === 0 && !form.applicant_type) return setError("Please select applicant type.");
    if (step === 1 && (!form.first_name || !form.last_name || !form.date_of_birth)) {
      return setError("Please fill in name and date of birth.");
    }
    if (step === 2 && isMinor && (!form.guardian_name || !form.guardian_phone)) {
      return setError("Parent/guardian name and phone are required for a minor.");
    }
    if (step === 3 && form.emergency_medical_consent === null) {
      return setError("Please choose an option for emergency medical authorization.");
    }
    if (step === 4 && !form.policy_agreed) {
      return setError("Please read and agree to the policies to continue.");
    }
    if (step === 5 && !form.signed_name.trim()) {
      return setError("Please type your full legal name to sign.");
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function back() {
    setError("");
    setStep((s) => Math.max(s - 1, 0));
  }

  function handlePolicyScroll(e) {
    const el = e.target;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 20) {
      setScrolledToBottom(true);
    }
  }

  async function submit() {
    setSubmitting(true);
    setError("");
    try {
      const { error: insertError } = await supabase.from("registrations").insert([
        {
          ...form,
          policy_version: POLICY_VERSION,
          signed_at: new Date().toISOString(),
          user_agent: navigator.userAgent,
          // submitted_ip is intentionally left null here — the browser can't
          // reliably determine the visitor's IP. Capture it server-side
          // instead (e.g. a Netlify Function reading the request headers)
          // if you need it for the audit trail.
        },
      ]);
      if (insertError) throw insertError;
      setDone(true);
    } catch (err) {
      setError(err.message || "Something went wrong submitting your registration.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="registration-form">
        <h2>Thank you!</h2>
        <p>
          Your registration has been submitted. Our team will review it and
          contact you shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="registration-form">
      <h1>Champion Hankook Taekwondo — Registration</h1>
      <p className="step-indicator">
        Step {step + 1} of {STEPS.length}: {STEPS[step]}
      </p>

      {error && <p className="form-error">{error}</p>}

      {step === 0 && (
        <fieldset>
          <legend>Who is registering?</legend>
          <label>
            <input
              type="radio"
              name="applicant_type"
              checked={form.applicant_type === "adult"}
              onChange={() => update("applicant_type", "adult")}
            />
            Adult (18+) registering myself
          </label>
          <label>
            <input
              type="radio"
              name="applicant_type"
              checked={form.applicant_type === "minor"}
              onChange={() => update("applicant_type", "minor")}
            />
            Minor (under 18) — I am the parent/guardian
          </label>
        </fieldset>
      )}

      {step === 1 && (
        <fieldset>
          <legend>Applicant details</legend>
          <label>First name
            <input value={form.first_name} onChange={(e) => update("first_name", e.target.value)} />
          </label>
          <label>Last name
            <input value={form.last_name} onChange={(e) => update("last_name", e.target.value)} />
          </label>
          <label>Date of birth
            <input type="date" value={form.date_of_birth} onChange={(e) => update("date_of_birth", e.target.value)} />
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.has_medical_condition}
              onChange={(e) => update("has_medical_condition", e.target.checked)}
            />
            Applicant has a medical condition or physical limitation that would interfere with training
          </label>
          {form.has_medical_condition && (
            <label>Please explain
              <textarea
                value={form.medical_condition_details}
                onChange={(e) => update("medical_condition_details", e.target.value)}
              />
            </label>
          )}
          <label>Known allergies
            <input value={form.allergies} onChange={(e) => update("allergies", e.target.value)} />
          </label>
          <label>Current medications
            <input value={form.medications} onChange={(e) => update("medications", e.target.value)} />
          </label>
          <label>Family doctor / clinic name
            <input value={form.doctor_name} onChange={(e) => update("doctor_name", e.target.value)} />
          </label>
          <label>Doctor's phone
            <input value={form.doctor_phone} onChange={(e) => update("doctor_phone", e.target.value)} />
          </label>
          <label>Alberta Health Care # (optional)
            <input value={form.health_care_number} onChange={(e) => update("health_care_number", e.target.value)} />
          </label>
        </fieldset>
      )}

      {step === 2 && (
        <fieldset>
          <legend>Parent / guardian details {isMinor ? "" : "(optional)"}</legend>
          <label>Parent/guardian name
            <input value={form.guardian_name} onChange={(e) => update("guardian_name", e.target.value)} />
          </label>
          <label>Phone
            <input value={form.guardian_phone} onChange={(e) => update("guardian_phone", e.target.value)} />
          </label>
          <label>Email
            <input type="email" value={form.guardian_email} onChange={(e) => update("guardian_email", e.target.value)} />
          </label>
          <label>Emergency contact name
            <input value={form.emergency_contact_name} onChange={(e) => update("emergency_contact_name", e.target.value)} />
          </label>
          <label>Emergency contact phone
            <input value={form.emergency_contact_phone} onChange={(e) => update("emergency_contact_phone", e.target.value)} />
          </label>
          <label>Relationship
            <input value={form.emergency_contact_relationship} onChange={(e) => update("emergency_contact_relationship", e.target.value)} />
          </label>
          <label>Address
            <input value={form.address} onChange={(e) => update("address", e.target.value)} />
          </label>
          <label>City
            <input value={form.city} onChange={(e) => update("city", e.target.value)} />
          </label>
          <label>Postal code
            <input value={form.postal_code} onChange={(e) => update("postal_code", e.target.value)} />
          </label>
          <label>How did you hear about us?
            <select value={form.referral_source} onChange={(e) => update("referral_source", e.target.value)}>
              <option value="">Select...</option>
              <option value="word_of_mouth">Word of mouth</option>
              <option value="social_media">Social media</option>
              <option value="search_engine">Search engine</option>
              <option value="flyer">Flyer</option>
              <option value="other">Other</option>
            </select>
          </label>
          {form.referral_source === "other" && (
            <label>Please specify
              <input value={form.referral_other} onChange={(e) => update("referral_other", e.target.value)} />
            </label>
          )}
        </fieldset>
      )}

      {step === 3 && (
        <fieldset>
          <legend>Emergency medical treatment authorization</legend>
          <p>
            In the event the applicant is injured or becomes ill during a
            class or club activity and the parent/guardian or emergency
            contact cannot be reached immediately, do you authorize Champion
            Hankook Taekwondo staff to call emergency services and consent to
            emergency medical treatment on your behalf?
          </p>
          <label>
            <input
              type="radio"
              name="emergency_consent"
              checked={form.emergency_medical_consent === true}
              onChange={() => update("emergency_medical_consent", true)}
            />
            Yes, I authorize emergency medical treatment
          </label>
          <label>
            <input
              type="radio"
              name="emergency_consent"
              checked={form.emergency_medical_consent === false}
              onChange={() => update("emergency_medical_consent", false)}
            />
            No, contact me first in all cases
          </label>
        </fieldset>
      )}

      {step === 4 && (
        <fieldset>
          <legend>Club policies</legend>
          <div className="policy-scroll-box" onScroll={handlePolicyScroll}>
            {/* Replace this block with the full policy text from your
                Word/PDF version — waiver, payment, makeup, withdrawal,
                governing law, etc. Keeping it here as one block makes it
                easy to bump POLICY_VERSION whenever the wording changes. */}
            <h3>Photo, video &amp; marketing consent</h3>
            <p>...</p>
            <h3>Waiver &amp; assumption of risk</h3>
            <p>...</p>
            <h3>Code of conduct</h3>
            <p>...</p>
            <h3>Payment policy</h3>
            <p>...</p>
            <h3>Makeup class policy</h3>
            <p>...</p>
            <h3>Membership withdrawal</h3>
            <p>...</p>
            <h3>Governing law</h3>
            <p>...</p>
          </div>
          <label>
            <input
              type="radio"
              name="photo_consent"
              checked={form.photo_video_consent === true}
              onChange={() => update("photo_video_consent", true)}
            />
            Yes, I give photo/video consent
          </label>
          <label>
            <input
              type="radio"
              name="photo_consent"
              checked={form.photo_video_consent === false}
              onChange={() => update("photo_video_consent", false)}
            />
            No, I refuse consent
          </label>
          <label>
            <input
              type="checkbox"
              disabled={!scrolledToBottom}
              checked={form.policy_agreed}
              onChange={(e) => update("policy_agreed", e.target.checked)}
            />
            I have read and agree to all policies above
            {!scrolledToBottom && " (scroll to the bottom to enable)"}
          </label>
        </fieldset>
      )}

      {step === 5 && (
        <fieldset>
          <legend>Signature</legend>
          <label>Type your full legal name to sign
            <input value={form.signed_name} onChange={(e) => update("signed_name", e.target.value)} />
          </label>
          <p className="hint">Date will be recorded automatically as {new Date().toLocaleDateString()}.</p>
        </fieldset>
      )}

      {step === 6 && (
        <fieldset>
          <legend>Review your submission</legend>
          <pre className="review-json">{JSON.stringify(form, null, 2)}</pre>
          <p>Click submit below to send this registration for review.</p>
        </fieldset>
      )}

      <div className="form-nav">
        {step > 0 && <button onClick={back} disabled={submitting}>Back</button>}
        {step < STEPS.length - 1 && <button onClick={next}>Next</button>}
        {step === STEPS.length - 1 && (
          <button onClick={submit} disabled={submitting}>
            {submitting ? "Submitting..." : "Submit registration"}
          </button>
        )}
      </div>
    </div>
  );
}
