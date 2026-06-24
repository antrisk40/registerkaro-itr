'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import { fetchUsers, createUserRequest, updateUserRequest, deleteUserRequest } from '../../lib/api';

export default function UserManagementPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' or 'edit'
  const [selectedUser, setSelectedUser] = useState(null);

  // Form states
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('spoc');
  const [active, setActive] = useState(true);
  
  const [actionLoading, setActionLoading] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await fetchUsers();
      setUsers(data);
    } catch (err) {
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (isAdmin) {
      loadUsers();
    }
  }, [authLoading, isAdmin]);

  if (authLoading || loading) {
    return <p className="text-gray-400 p-8 text-center">Loading user management...</p>;
  }

  if (!isAdmin) {
    return <p className="text-red-400 p-8 text-center">Access denied. Administrator privileges required.</p>;
  }

  const openCreateModal = () => {
    setModalMode('create');
    setSelectedUser(null);
    setUsername('');
    setPassword('');
    setDisplayName('');
    setRole('spoc');
    setActive(true);
    setError(null);
    setShowModal(true);
  };

  const openEditModal = (user) => {
    setModalMode('edit');
    setSelectedUser(user);
    setUsername(user.username);
    setPassword(''); // keep blank unless changing
    setDisplayName(user.displayName);
    setRole(user.role);
    setActive(user.active);
    setError(null);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    setError(null);

    try {
      if (modalMode === 'create') {
        await createUserRequest({ username, password, displayName, role });
      } else {
        const updateData = { displayName, role, active };
        if (password) updateData.password = password;
        await updateUserRequest(selectedUser._id, updateData);
      }
      setShowModal(false);
      await loadUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleActive = async (user) => {
    try {
      await updateUserRequest(user._id, { active: !user.active });
      await loadUsers();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDelete = async (userId) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try {
      await deleteUserRequest(userId);
      await loadUsers();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <>
      <PageHeader
        title="User Management"
        description="Add, edit, ban, delete and manage SPOC operators and administrators."
        action={
          <Button onClick={openCreateModal}>➕ Add New User</Button>
        }
      />

      <Card className="p-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-gray-500">
                <th className="pb-3 font-medium">Display Name</th>
                <th className="pb-3 font-medium">Username</th>
                <th className="pb-3 font-medium">Role</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {users.map((user) => (
                <tr key={user._id} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="py-4 pr-4">
                    <p className="text-sm font-semibold text-gray-200">{user.displayName}</p>
                  </td>
                  <td className="py-4 pr-4">
                    <p className="text-sm font-mono text-gray-400">{user.username}</p>
                  </td>
                  <td className="py-4 pr-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      user.role === 'admin' 
                        ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' 
                        : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="py-4 pr-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      user.active 
                        ? 'bg-green-500/10 text-green-400 border border-green-500/20' 
                        : 'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${user.active ? 'bg-green-400' : 'bg-red-400'}`} />
                      {user.active ? 'Active' : 'Blocked / Banned'}
                    </span>
                  </td>
                  <td className="py-4 text-right flex justify-end gap-2">
                    <Button variant="secondary" className="!py-1.5 !px-3" onClick={() => openEditModal(user)}>
                      Edit
                    </Button>
                    <Button 
                      variant={user.active ? 'danger' : 'primary'} 
                      className="!py-1.5 !px-3" 
                      onClick={() => handleToggleActive(user)}
                    >
                      {user.active ? 'Block' : 'Unblock'}
                    </Button>
                    <Button variant="danger" className="!py-1.5 !px-3" onClick={() => handleDelete(user._id)}>
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card className="max-w-md w-full p-6 border border-white/10 relative bg-[#1e1e2c]">
            <h3 className="text-lg font-bold text-white mb-4">
              {modalMode === 'create' ? 'Add New User' : 'Edit User Details'}
            </h3>
            
            {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Display Name</label>
                <Input
                  type="text"
                  required
                  placeholder="Enter full name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Username</label>
                <Input
                  type="text"
                  required
                  disabled={modalMode === 'edit'}
                  placeholder="Enter username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  {modalMode === 'edit' ? 'Password (leave blank to keep unchanged)' : 'Password'}
                </label>
                <Input
                  type="password"
                  required={modalMode === 'create'}
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                >
                  <option value="spoc" className="bg-[#1e1e2c]">SPOC Operator (spoc)</option>
                  <option value="admin" className="bg-[#1e1e2c]">Administrator (admin)</option>
                </select>
              </div>

              {modalMode === 'edit' && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="active-checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 border-white/10 bg-white/5"
                  />
                  <label htmlFor="active-checkbox" className="text-sm font-medium text-gray-300">
                    User Active (uncheck to block/ban)
                  </label>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={actionLoading}>
                  {modalMode === 'create' ? 'Create User' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </>
  );
}
