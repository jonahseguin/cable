import { Card, CardDescription, CardHeader, CardTitle } from '@[removed]/ui/components/card';

export default function SettingsPage() {
  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>Account Settings</CardTitle>
          <CardDescription>Manage your account settings</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
