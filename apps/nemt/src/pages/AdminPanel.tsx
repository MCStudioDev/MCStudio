import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { Shield, Users, Building2, Plus, X, Trash2, ArrowLeft, UserPlus, Copy, CheckCircle2 } from 'lucide-react';
import { db } from '../config/firebase';
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, getDocs, query, where, setDoc } from 'firebase/firestore';
import { useTenant } from '../contexts/TenantContext';
import { useAuth } from '../components/DispatcherAuthWrapper';

interface Company {
  id: string;
  name: string;
  plan: string;
  createdAt: string;
  ownerUid: string;
}

interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  companyId: string;
  role: string;
  createdAt: string;
}

export default function AdminPanel() {
  const { companyId, companyName, userRole } = useTenant();
  const { user } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'companies' | 'users'>('companies');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [companyForm, setCompanyForm] = useState({ name: '', plan: 'free' });
  const [userForm, setUserForm] = useState({ email: '', displayName: '', role: 'dispatcher', companyId: '' });

  // Load companies (admin sees their own company; super-admin could see all)
  useEffect(() => {
    if (!companyId) return;

    const unsubCompanies = onSnapshot(collection(db, 'companies'), (snapshot) => {
      setCompanies(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Company)));
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserRecord)));
    });

    return () => {
      unsubCompanies();
      unsubUsers();
    };
  }, [companyId]);

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const newCompanyId = `company_${Date.now().toString(36)}`;
      await setDoc(doc(db, 'companies', newCompanyId), {
        name: companyForm.name,
        plan: companyForm.plan,
        createdAt: new Date().toISOString(),
        ownerUid: user?.uid || '',
      });
      setIsModalOpen(false);
      setCompanyForm({ name: '', plan: 'free' });
      showNotification(`Company "${companyForm.name}" created!`);
    } catch (err) {
      console.error('Error creating company:', err);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Create a placeholder user document. 
      // When the actual user signs in with this email, TenantContext will find their company.
      const userId = `placeholder_${Date.now().toString(36)}`;
      await setDoc(doc(db, 'users', userId), {
        email: userForm.email,
        displayName: userForm.displayName,
        companyId: userForm.companyId || companyId,
        role: userForm.role,
        createdAt: new Date().toISOString(),
        isPlaceholder: true,
      });
      setIsUserModalOpen(false);
      setUserForm({ email: '', displayName: '', role: 'dispatcher', companyId: '' });
      showNotification(`User "${userForm.displayName}" pre-registered!`);
    } catch (err) {
      console.error('Error creating user:', err);
    }
  };

  const handleDeleteCompany = async (companyIdToDelete: string) => {
    if (!confirm('Delete this company and all associated data? This cannot be undone.')) return;
    try {
      await deleteDoc(doc(db, 'companies', companyIdToDelete));
      showNotification('Company deleted.');
    } catch (err) {
      console.error('Error deleting company:', err);
    }
  };

  const showNotification = (message: string) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 3000);
  };

  const copyCompanyId = (id: string) => {
    navigator.clipboard.writeText(id);
    showNotification('Company ID copied to clipboard!');
  };

  if (userRole !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="bg-white p-8 rounded-xl shadow-sm max-w-md w-full text-center">
          <Shield className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h2>
          <p className="text-slate-500 mb-4">You need admin privileges to access this panel.</p>
          <Link to="/dispatch" className="text-indigo-600 font-medium hover:underline">← Back to Dispatch</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col">
        <div className="p-6">
          <h1 className="text-xl font-bold text-white tracking-tight">Admin Panel</h1>
          <p className="text-xs text-amber-400 mt-1">{companyName}</p>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          <button
            onClick={() => setActiveTab('companies')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
              activeTab === 'companies' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Building2 className="w-5 h-5" />
            Companies
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
              activeTab === 'users' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Users className="w-5 h-5" />
            Users
          </button>
        </nav>

        <div className="p-4 border-t border-slate-800">
          <Link
            to="/dispatch"
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dispatch
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center px-8 justify-between shrink-0">
          <h2 className="text-lg font-semibold text-slate-800">
            {activeTab === 'companies' ? 'Company Management' : 'User Management'}
          </h2>
          <button
            onClick={() => activeTab === 'companies' ? setIsModalOpen(true) : setIsUserModalOpen(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {activeTab === 'companies' ? 'New Company' : 'Add User'}
          </button>
        </header>

        <div className="flex-1 overflow-auto p-8">
          {activeTab === 'companies' && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4">Company Name</th>
                    <th className="px-6 py-4">Company ID</th>
                    <th className="px-6 py-4">Plan</th>
                    <th className="px-6 py-4">Created</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {companies.map((company) => (
                    <tr key={company.id} className={`hover:bg-slate-50 transition ${company.id === companyId ? 'bg-indigo-50/30' : ''}`}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-slate-400" />
                          <span className="font-medium text-slate-900">{company.name}</span>
                          {company.id === companyId && (
                            <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] rounded-full font-bold">YOU</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-slate-100 px-2 py-1 rounded font-mono">{company.id}</code>
                          <button
                            onClick={() => copyCompanyId(company.id)}
                            className="text-slate-400 hover:text-indigo-600 transition"
                            title="Copy ID"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          company.plan === 'pro' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {company.plan || 'free'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-500 text-xs">
                        {company.createdAt ? new Date(company.createdAt).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {company.id !== companyId && (
                          <button
                            onClick={() => handleDeleteCompany(company.id)}
                            className="text-slate-400 hover:text-red-600 transition p-1"
                            title="Delete Company"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'users' && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4">Name</th>
                    <th className="px-6 py-4">Email</th>
                    <th className="px-6 py-4">Company</th>
                    <th className="px-6 py-4">Role</th>
                    <th className="px-6 py-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((u) => {
                    const company = companies.find(c => c.id === u.companyId);
                    return (
                      <tr key={u.id} className="hover:bg-slate-50 transition">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-sm">
                              {u.displayName?.[0] || u.email?.[0] || '?'}
                            </div>
                            <span className="font-medium text-slate-900">{u.displayName || 'Unnamed'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-600">{u.email}</td>
                        <td className="px-6 py-4 text-slate-600">{company?.name || u.companyId}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                            u.role === 'admin' ? 'bg-amber-100 text-amber-700' :
                            u.role === 'dispatcher' ? 'bg-blue-100 text-blue-700' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                            (u as any).isPlaceholder ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {(u as any).isPlaceholder ? 'Pending' : 'Active'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Create Company Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-slate-100">
              <h3 className="text-xl font-bold text-slate-800">Create New Company</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleCreateCompany} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Company Name</label>
                <input
                  type="text"
                  required
                  value={companyForm.name}
                  onChange={e => setCompanyForm({...companyForm, name: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  placeholder="ABC Transport Co."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Plan</label>
                <select
                  value={companyForm.plan}
                  onChange={e => setCompanyForm({...companyForm, plan: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500"
                >
                  <option value="free">Free</option>
                  <option value="pro">Pro ($49/mo)</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              <button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold text-lg shadow-md transition"
              >
                Create Company
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {isUserModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-slate-100">
              <h3 className="text-xl font-bold text-slate-800">Pre-Register User</h3>
              <button onClick={() => setIsUserModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Display Name</label>
                <input
                  type="text"
                  required
                  value={userForm.displayName}
                  onChange={e => setUserForm({...userForm, displayName: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  placeholder="John Smith"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={userForm.email}
                  onChange={e => setUserForm({...userForm, email: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  placeholder="john@company.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Assign to Company</label>
                <select
                  value={userForm.companyId}
                  onChange={e => setUserForm({...userForm, companyId: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500"
                >
                  <option value="">Current Company ({companyName})</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                <select
                  value={userForm.role}
                  onChange={e => setUserForm({...userForm, role: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500"
                >
                  <option value="dispatcher">Dispatcher</option>
                  <option value="admin">Admin</option>
                  <option value="driver">Driver</option>
                </select>
              </div>
              <button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold text-lg shadow-md transition flex items-center justify-center gap-2"
              >
                <UserPlus className="w-5 h-5" />
                Pre-Register User
              </button>
              <p className="text-xs text-slate-400 text-center">
                The user will be automatically linked to this company when they sign in with Google.
              </p>
            </form>
          </div>
        </div>
      )}

      {/* Notification Toast */}
      {notification && (
        <div className="fixed bottom-8 right-8 bg-slate-900 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 z-50 border border-slate-700">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <span className="font-medium">{notification}</span>
        </div>
      )}
    </div>
  );
}
