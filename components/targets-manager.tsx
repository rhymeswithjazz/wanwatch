'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type TargetType = 'dns' | 'domain' | 'ip';

interface MonitoringTarget {
  id: number;
  target: string;
  displayName: string;
  type: TargetType;
  isEnabled: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

interface ValidationResult {
  valid: boolean;
  reachable?: boolean;
  latencyMs?: number | null;
  suggestedType?: string;
  error?: string;
  warning?: string;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function TargetsManager() {
  const { data, error, mutate } = useSWR<{ targets: MonitoringTarget[] }>(
    '/api/settings/targets',
    fetcher,
    { refreshInterval: 30000 }
  );

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<{
    target: string;
    displayName: string;
    type: TargetType;
    priority: number;
    isEnabled: boolean;
  }>({
    target: '',
    displayName: '',
    type: 'domain',
    priority: 100,
    isEnabled: true,
  });

  const [validationStatus, setValidationStatus] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const resetForm = () => {
    setFormData({
      target: '',
      displayName: '',
      type: 'domain',
      priority: 100,
      isEnabled: true,
    });
    setValidationStatus(null);
    setIsAdding(false);
    setEditingId(null);
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 5000);
  };

  const handleValidate = async () => {
    if (!formData.target.trim()) {
      showMessage('error', 'Please enter a target first');
      return;
    }

    setIsValidating(true);
    setValidationStatus(null);

    try {
      const response = await fetch('/api/settings/targets/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: formData.target }),
      });

      const result = await response.json();

      if (response.ok) {
        setValidationStatus(result);
        if (result.suggestedType) {
          setFormData((prev) => ({ ...prev, type: result.suggestedType }));
        }
      } else {
        setValidationStatus({ valid: false, error: result.error });
      }
    } catch (err) {
      setValidationStatus({ valid: false, error: 'Validation failed. Please try again.' });
    } finally {
      setIsValidating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const url = '/api/settings/targets';
      const method = editingId ? 'PUT' : 'POST';
      const body = editingId ? { id: editingId, ...formData } : formData;

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        showMessage('success', editingId ? 'Target updated successfully' : 'Target added successfully');
        await mutate();
        resetForm();
      } else {
        const result = await response.json();
        showMessage('error', result.error || 'Failed to save target');
      }
    } catch (err) {
      showMessage('error', 'Failed to save target. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (target: MonitoringTarget) => {
    setFormData({
      target: target.target,
      displayName: target.displayName,
      type: target.type as 'dns' | 'domain' | 'ip',
      priority: target.priority,
      isEnabled: target.isEnabled,
    });
    setEditingId(target.id);
    setIsAdding(true);
    setValidationStatus(null);
  };

  const handleToggleEnabled = async (target: MonitoringTarget) => {
    try {
      const response = await fetch('/api/settings/targets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: target.id,
          isEnabled: !target.isEnabled,
        }),
      });

      if (response.ok) {
        showMessage('success', `Target ${!target.isEnabled ? 'enabled' : 'disabled'} successfully`);
        await mutate();
      } else {
        const result = await response.json();
        showMessage('error', result.error || 'Failed to update target');
      }
    } catch (err) {
      showMessage('error', 'Failed to update target. Please try again.');
    }
  };

  const handleDelete = async (target: MonitoringTarget) => {
    if (!confirm(`Are you sure you want to delete "${target.displayName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/settings/targets?id=${target.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        showMessage('success', 'Target deleted successfully');
        await mutate();
      } else {
        const result = await response.json();
        showMessage('error', result.error || 'Failed to delete target');
      }
    } catch (err) {
      showMessage('error', 'Failed to delete target. Please try again.');
    }
  };

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Error</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-destructive">Failed to load monitoring targets</p>
        </CardContent>
      </Card>
    );
  }

  const targets = data?.targets || [];

  return (
    <div className="space-y-6">
      {statusMessage && (
        <div
          className={`p-4 rounded-md ${
            statusMessage.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200'
              : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200'
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Monitoring Targets</CardTitle>
          <CardDescription>
            Manage the DNS servers and websites used to detect internet connectivity
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Button onClick={() => setIsAdding(!isAdding)} variant={isAdding ? 'outline' : 'default'}>
              {isAdding ? 'Cancel' : '+ Add Target'}
            </Button>
          </div>

          {isAdding && (
            <form onSubmit={handleSubmit} className="mb-6 p-4 border rounded-lg space-y-4 bg-muted/50">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="target">Target (IP or Domain) *</Label>
                  <div className="flex gap-2">
                    <Input
                      id="target"
                      value={formData.target}
                      onChange={(e) => setFormData((prev) => ({ ...prev, target: e.target.value }))}
                      placeholder="e.g., 8.8.8.8 or google.com"
                      required
                      disabled={!!editingId}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleValidate}
                      disabled={isValidating || !formData.target.trim()}
                    >
                      {isValidating ? 'Testing...' : 'Test'}
                    </Button>
                  </div>
                  {validationStatus && (
                    <p
                      className={`text-sm ${
                        validationStatus.valid
                          ? validationStatus.reachable
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-yellow-600 dark:text-yellow-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {validationStatus.error ||
                        validationStatus.warning ||
                        (validationStatus.reachable
                          ? `✓ Reachable (${validationStatus.latencyMs?.toFixed(1)}ms)`
                          : '⚠ Not reachable (can still add)')}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="displayName">Display Name *</Label>
                  <Input
                    id="displayName"
                    value={formData.displayName}
                    onChange={(e) => setFormData((prev) => ({ ...prev, displayName: e.target.value }))}
                    placeholder="e.g., Google DNS"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="type">Type *</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value) => setFormData((prev) => ({ ...prev, type: value as TargetType }))}
                  >
                    <SelectTrigger id="type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dns">DNS Server</SelectItem>
                      <SelectItem value="domain">Domain</SelectItem>
                      <SelectItem value="ip">IP Address</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="priority">Priority (lower = checked first)</Label>
                  <Input
                    id="priority"
                    type="number"
                    min="1"
                    value={formData.priority}
                    onChange={(e) => setFormData((prev) => ({ ...prev, priority: parseInt(e.target.value) || 100 }))}
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="isEnabled"
                  checked={formData.isEnabled}
                  onChange={(e) => setFormData((prev) => ({ ...prev, isEnabled: e.target.checked }))}
                  className="rounded"
                />
                <Label htmlFor="isEnabled" className="cursor-pointer">
                  Enabled
                </Label>
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? 'Saving...' : editingId ? 'Update Target' : 'Add Target'}
                </Button>
                {editingId && (
                  <Button type="button" variant="outline" onClick={resetForm}>
                    Cancel Edit
                  </Button>
                )}
              </div>
            </form>
          )}

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Display Name</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {targets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No monitoring targets configured
                    </TableCell>
                  </TableRow>
                ) : (
                  targets.map((target) => (
                    <TableRow key={target.id}>
                      <TableCell>
                        <div
                          className={`w-3 h-3 rounded-full ${target.isEnabled ? 'bg-green-500' : 'bg-gray-400'}`}
                          title={target.isEnabled ? 'Enabled' : 'Disabled'}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{target.displayName}</TableCell>
                      <TableCell className="font-mono text-sm">{target.target}</TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                            target.type === 'dns'
                              ? 'bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-900/20 dark:text-blue-300'
                              : target.type === 'ip'
                              ? 'bg-purple-50 text-purple-700 ring-purple-600/20 dark:bg-purple-900/20 dark:text-purple-300'
                              : 'bg-gray-50 text-gray-700 ring-gray-600/20 dark:bg-gray-900/20 dark:text-gray-300'
                          }`}
                        >
                          {target.type.toUpperCase()}
                        </span>
                      </TableCell>
                      <TableCell>{target.priority}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleEdit(target)}>
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleToggleEnabled(target)}
                          >
                            {target.isEnabled ? 'Disable' : 'Enable'}
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => handleDelete(target)}>
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {targets.length > 0 && (
            <p className="text-sm text-muted-foreground mt-4">
              Total targets: {targets.length} | Enabled: {targets.filter((t) => t.isEnabled).length}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
