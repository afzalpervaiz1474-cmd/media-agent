import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { Shield, Clock, Trash2, Eye, Lock } from 'lucide-react'

export default function PrivacyPolicy() {
  return (
    <div className="max-w-4xl mx-auto p-6 md:p-8">
      <PageHeader eyebrow="Legal" title="Privacy Policy" description="How we collect, use, and protect your data." />

      <div className="prose-quiet space-y-8">
        <section>
          <h2 className="h-display text-2xl mt-6 mb-3">Information We Collect</h2>
          <p className="text-[color:var(--color-ink-2)] leading-relaxed">
            When you use Modulate, we collect information you provide directly — such as your name, email address, and profile details when you create an account. We also collect data about how you interact with our service, including your IP address, browser type, pages visited, and the content you upload or create through our platform.
          </p>
        </section>

        <section>
          <h2 className="h-display text-2xl mt-6 mb-3">OAuth and Social Media Data</h2>
          <p className="text-[color:var(--color-ink-2)] leading-relaxed">
            To provide our services, you may connect social media accounts (YouTube, TikTok, Instagram, Facebook) via OAuth. We receive an access token and refresh token from the respective provider. These tokens are stored server-side in your Supabase-authenticated database and are used only to read content, upload media, and manage posts on your behalf. We do not store your social media passwords, and we never share your OAuth tokens with third parties.
          </p>
          <div className="mt-4 flex items-start gap-3 text-[color:var(--color-ink-2)]">
            <Lock size={16} className="mt-0.5 text-[color:var(--color-accent)] shrink-0" />
            <p className="text-sm">OAuth tokens are encrypted at rest and transmitted over TLS. You can revoke access at any time from the Accounts page.</p>
          </div>
        </section>

        <section>
          <h2 className="h-display text-2xl mt-6 mb-3">How We Use Your Data</h2>
          <p className="text-[color:var(--color-ink-2)] leading-relaxed">
            We use your data to operate and improve Modulate. This includes displaying content, processing uploads, running automations, generating AI-assisted drafts, and delivering notifications. Your content is processed on our servers to enable these features. We do not sell your personal information or use it for advertising purposes.
          </p>
        </section>

        <section>
          <h2 className="h-display text-2xl mt-6 mb-3">Data Storage and Retention</h2>
          <p className="text-[color:var(--color-ink-2)] leading-relaxed">
            Your data is stored on Supabase infrastructure. Content you upload (images, videos, audio) is stored temporarily to enable processing and publishing. Once a job completes or content is published to a connected social account, original media files are retained on our servers only as long as necessary for service operation, unless you choose to keep them in your workspace.
          </p>
          <div className="mt-4 flex items-start gap-3 text-[color:var(--color-ink-2)]">
            <Clock size={16} className="mt-0.5 text-[color:var(--color-accent)] shrink-0" />
            <p className="text-sm">You can delete any content, automations, or jobs at any time from your dashboard. Deleted items are removed from our active databases within 30 days.</p>
          </div>
        </section>

        <section>
          <h2 className="h-display text-2xl mt-6 mb-3">Your Rights</h2>
          <p className="text-[color:var(--color-ink-2)] leading-relaxed">
            Depending on your location, you may have the right to access, correct, or delete your personal data, and to restrict or object to certain processing. You may also request a portable copy of your data. To exercise these rights, contact us at the address below or use the Account settings page.
          </p>
        </section>

        <section>
          <h2 className="h-display text-2xl mt-6 mb-3">Data Sharing</h2>
          <p className="text-[color:var(--color-ink-2)] leading-relaxed">
            We share your data only as necessary to provide our services: with Supabase (for authentication and database storage), with connected social media platforms (only when you initiate an action), and with service providers who assist in operating Modulate (hosting, analytics, support). We do not sell or rent your personal information.
          </p>
          <div className="mt-4 flex items-start gap-3 text-[color:var(--color-ink-2)]">
            <Eye size={16} className="mt-0.5 text-[color:var(--color-accent)] shrink-0" />
            <p className="text-sm">No personal data is shared with advertisers or used for targeted advertising.</p>
          </div>
        </section>

        <section>
          <h2 className="h-display text-2xl mt-6 mb-3">Security</h2>
          <p className="text-[color:var(--color-ink-2)] leading-relaxed">
            We implement industry-standard security measures to protect your data, including encryption in transit (TLS) and at rest, regular security audits, and access controls. While we strive to protect your information, please note that no method of transmission over the internet or electronic storage is 100% secure.
          </p>
          <div className="mt-4 flex items-start gap-3 text-[color:var(--color-ink-2)]">
            <Shield size={16} className="mt-0.5 text-[color:var(--color-accent)] shrink-0" />
            <p className="text-sm">All authentication credentials and OAuth tokens are handled server-side and never exposed to your browser.</p>
          </div>
        </section>

        <section>
          <h2 className="h-display text-2xl mt-6 mb-3">Data Deletion</h2>
          <p className="text-[color:var(--color-ink-2)] leading-relaxed">
            You may request deletion of all personal data associated with your account at any time. Upon receiving such a request, we will permanently delete your data within 30 days, except where retention is required by law or necessary to resolve disputes. This includes your account information, uploaded content, automations, and connected social media tokens.
          </p>
          <div className="mt-4 flex items-start gap-3 text-[color:var(--color-ink-2)]">
            <Trash2 size={16} className="mt-0.5 text-[color:var(--color-accent)] shrink-0" />
            <p className="text-sm">To request data deletion, contact us at the details below or delete your account from Settings.</p>
          </div>
        </section>

        <section>
          <h2 className="h-display text-2xl mt-6 mb-3">Changes to This Policy</h2>
          <p className="text-[color:var(--color-ink-2)] leading-relaxed">
            We may update this Privacy Policy from time to time. We will notify you of material changes via email or through a notice on the platform. Your continued use of Modulate after changes constitutes acceptance of the updated policy. The effective date of the current policy is noted at the top of this page.
          </p>
        </section>

        <section>
          <h2 className="h-display text-2xl mt-6 mb-3">Contact</h2>
          <p className="text-[color:var(--color-ink-2)] leading-relaxed">
            For questions about this Privacy Policy or your data, please contact us at <a className="link" href="mailto:support@modulate.so">support@modulate.so</a>.
          </p>
        </section>
      </div>

      <div className="mt-12 pt-6 border-t border-[color:var(--color-border)]">
        <Link to="/" className="btn btn-outline">← Back to home</Link>
      </div>
    </div>
  )
}
