import { useState, type FormEvent } from 'react';
import type { VendorProfile as VendorProfileType } from '../../types/vendor';
import { updateVendorProfile, changeVendorPassword } from '../../services/vendorProfile';

interface VendorProfileProps {
  vendor: VendorProfileType | null;
  onProfileUpdated: () => void;
}

export function VendorProfile({ vendor, onProfileUpdated }: VendorProfileProps) {
  const [activeTab, setActiveTab] = useState<'info' | 'pwd'>('info');

  // Info form state
  const [person, setPerson] = useState(vendor?.contactPerson || '');
  const [phone, setPhone] = useState(vendor?.contactPhone || '');
  const [address, setAddress] = useState(vendor?.officeAddress || '');
  const [stateVal, setStateVal] = useState(vendor?.state || '');
  const [isSavingInfo, setIsSavingInfo] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);

  // Password form state
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [isSavingPwd, setIsSavingPwd] = useState(false);
  const [pwdMessage, setPwdMessage] = useState<string | null>(null);
  const [pwdError, setPwdError] = useState<string | null>(null);

  const handleInfoSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSavingInfo) return;

    setIsSavingInfo(true);
    setInfoMessage(null);
    setInfoError(null);

    try {
      await updateVendorProfile({
        contactPerson: person,
        contactPhone: phone,
        officeAddress: address,
        state: stateVal
      });
      setInfoMessage('Profile updated successfully.');
      onProfileUpdated();
    } catch (err: unknown) {
      setInfoError(err instanceof Error ? err.message : 'Profile update failed.');
    } finally {
      setIsSavingInfo(false);
    }
  };

  const handlePwdSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSavingPwd) return;

    if (newPwd !== confirmPwd) {
      setPwdError('New password and confirmation do not match.');
      return;
    }

    if (newPwd.length < 8) {
      setPwdError('New password must be at least 8 characters long.');
      return;
    }

    setIsSavingPwd(true);
    setPwdMessage(null);
    setPwdError(null);

    try {
      await changeVendorPassword({
        currentPassword: currentPwd,
        newPassword: newPwd,
        confirmPassword: confirmPwd
      });
      setPwdMessage('Password changed successfully! Please use your new password next time.');
      setCurrentPwd('');
      setNewPwd('');
      setConfirmPwd('');
    } catch (err: unknown) {
      setPwdError(err instanceof Error ? err.message : 'Password change failed.');
    } finally {
      setIsSavingPwd(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: 680, margin: '0 auto' }}>
      <div className="card-header">
        <h2 className="card-title">Company Profile &amp; Security</h2>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 10,
          marginBottom: 20,
          borderBottom: '1px solid var(--border-color)',
          paddingBottom: 8
        }}
      >
        <button
          type="button"
          className={`nav-tab ${activeTab === 'info' ? 'active' : ''}`}
          onClick={() => setActiveTab('info')}
        >
          Company Information
        </button>
        <button
          type="button"
          className={`nav-tab ${activeTab === 'pwd' ? 'active' : ''}`}
          onClick={() => setActiveTab('pwd')}
        >
          Change Password
        </button>
      </div>

      {activeTab === 'info' ? (
        <form onSubmit={handleInfoSubmit}>
          {infoMessage && (
            <div
              className="action-banner banner-success"
              style={{ marginBottom: 16 }}
              role="status"
            >
              ✓ {infoMessage}
            </div>
          )}
          {infoError && (
            <div
              className="action-banner banner-danger"
              style={{ marginBottom: 16 }}
              role="alert"
            >
              ⚠️ {infoError}
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="prof-company">
              Company Name (Registered)
            </label>
            <input
              type="text"
              id="prof-company"
              className="form-input"
              value={vendor?.companyName || ''}
              readOnly
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="prof-email">
              Vendor Contact Email (Primary Identity)
            </label>
            <input
              type="email"
              id="prof-email"
              className="form-input"
              value={vendor?.contactEmail || ''}
              readOnly
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label" htmlFor="prof-person">
                Contact Person
              </label>
              <input
                type="text"
                id="prof-person"
                className="form-input"
                placeholder="Full Name"
                value={person}
                onChange={(e) => setPerson(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="prof-phone">
                Contact Phone
              </label>
              <input
                type="tel"
                id="prof-phone"
                className="form-input"
                placeholder="+60 12-345 6789"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="prof-address">
              Office Address
            </label>
            <input
              type="text"
              id="prof-address"
              className="form-input"
              placeholder="Unit, Street, City"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="prof-state">
              State / Federal Territory
            </label>
            <input
              type="text"
              id="prof-state"
              className="form-input"
              placeholder="e.g. Selangor, Kuala Lumpur"
              value={stateVal}
              onChange={(e) => setStateVal(e.target.value)}
            />
          </div>

          <button
            type="submit"
            id="btn-save-profile"
            className="btn-action-primary"
            disabled={isSavingInfo}
          >
            {isSavingInfo ? 'Saving Changes…' : 'Save Profile Changes'}
          </button>
        </form>
      ) : (
        <form onSubmit={handlePwdSubmit}>
          {pwdMessage && (
            <div
              className="action-banner banner-success"
              style={{ marginBottom: 16 }}
              role="status"
            >
              ✓ {pwdMessage}
            </div>
          )}
          {pwdError && (
            <div
              className="action-banner banner-danger"
              style={{ marginBottom: 16 }}
              role="alert"
            >
              ⚠️ {pwdError}
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="pwd-current">
              Current Password *
            </label>
            <input
              type="password"
              id="pwd-current"
              className="form-input"
              required
              value={currentPwd}
              onChange={(e) => setCurrentPwd(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="pwd-new">
              New Password (Min 8 Characters) *
            </label>
            <input
              type="password"
              id="pwd-new"
              className="form-input"
              required
              minLength={8}
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="pwd-confirm">
              Confirm New Password *
            </label>
            <input
              type="password"
              id="pwd-confirm"
              className="form-input"
              required
              minLength={8}
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
            />
          </div>

          <button
            type="submit"
            id="btn-save-pwd"
            className="btn-action-primary"
            disabled={isSavingPwd}
          >
            {isSavingPwd ? 'Updating Password…' : 'Update Password'}
          </button>
        </form>
      )}
    </div>
  );
}

