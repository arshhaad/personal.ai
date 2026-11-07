import { useAuth } from '../context/useAuth';
import UserProfileCard from '../components/profile/UserProfileCard';
import { LayoutDashboard, CheckCircle2, Server, Shield } from 'lucide-react';

export default function DashboardPage() {
  const { user } = useAuth();
  const firstName = user?.first_name || user?.username || 'User';

  return (
    <div className="dashboard-container">
      <div className="dashboard-header-section">
        <div className="welcome-tag">
          <LayoutDashboard size={18} />
          <span>Personal AI Dashboard</span>
        </div>
        <h1 className="dashboard-welcome">Welcome back, {firstName}!</h1>
        <p className="dashboard-sub">
          Personal AI – Your Own Knowledge-Based AI Assistant
        </p>
      </div>

      <div className="dashboard-grid">
        <div className="main-col">
          <UserProfileCard />
        </div>

        <div className="side-col">
          <div className="info-card">
            <div className="info-card-header">
              <Server size={18} className="info-icon" />
              <h3>Authentication Status</h3>
            </div>
            <div className="info-card-body">
              <div className="status-row">
                <CheckCircle2 size={16} color="#10b981" />
                <span>Google OAuth 2.0 Connected</span>
              </div>
              <div className="status-row">
                <CheckCircle2 size={16} color="#10b981" />
                <span>Database User Profile Synced</span>
              </div>
              <div className="status-row">
                <CheckCircle2 size={16} color="#10b981" />
                <span>SimpleJWT Session Guard Active</span>
              </div>
            </div>
          </div>

          <div className="info-card">
            <div className="info-card-header">
              <Shield size={18} className="info-icon" />
              <h3>Security & Protection</h3>
            </div>
            <div className="info-card-body">
              <p className="oauth-desc">
                Protected routes require verified JSON Web Tokens issued by Django. Passwords are never stored for Google OAuth users, and credentials stay securely encrypted on the backend.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
