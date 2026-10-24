'use client'

import { Button, ConfirmationModal, toast, useModal } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { useHydrated } from '@/components/forms/use-hydrated'
import { fi } from '@/i18n/fi'

const t = fi.admin.gdpr.actions

const CONFIRM_DELETE_SLUG = 'user-gdpr-confirm-delete'

type Props = {
  userId: number
  /** Admin accounts cannot be deleted here (the route refuses them too). */
  isAdminAccount: boolean
  /** `deletedAt` is set: the deletion job is already on its way. */
  beingDeleted: boolean
}

/** POST one of the admin GDPR routes; the error message the route sends, or `null` on success. */
async function post(path: string): Promise<string | null> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    if (res.ok) return null
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    return body?.error?.message ?? t.failed
  } catch {
    return t.failed
  }
}

/**
 * The support-request buttons of the user detail view (MV-098): "Vie käyttäjän tiedot" posts
 * `/api/admin/users/[id]/export`; "Poista käyttäjän tili" asks for confirmation, posts
 * `/api/admin/users/[id]/delete` and returns to the user list. Both actions are audited in
 * `job_runs` by the routes.
 */
export function UserGdprActions({ userId, isAdminAccount, beingDeleted }: Props) {
  const router = useRouter()
  const { openModal } = useModal()
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null)
  const hydrated = useHydrated()

  async function exportData() {
    setBusy('export')
    const error = await post(`/api/admin/users/${userId}/export`)
    setBusy(null)
    if (error) toast.error(error)
    else toast.success(t.exported)
    router.refresh()
  }

  async function deleteAccount() {
    setBusy('delete')
    const error = await post(`/api/admin/users/${userId}/delete`)
    setBusy(null)
    if (error) {
      toast.error(error)
      router.refresh()
      return
    }
    toast.success(t.deleted)
    router.push('/admin/collections/users')
  }

  return (
    <div data-hydrated={hydrated ? '' : undefined} data-testid="user-gdpr-actions">
      <Button buttonStyle="secondary" disabled={busy !== null || beingDeleted} onClick={exportData}>
        {busy === 'export' ? t.exporting : t.export}
      </Button>
      <Button
        buttonStyle="error"
        disabled={busy !== null || isAdminAccount || beingDeleted}
        onClick={() => openModal(CONFIRM_DELETE_SLUG)}
      >
        {busy === 'delete' ? t.deleting : t.delete}
      </Button>
      {isAdminAccount ? <p>{t.adminAccount}</p> : null}
      {beingDeleted ? <p>{t.beingDeleted}</p> : null}
      <ConfirmationModal
        modalSlug={CONFIRM_DELETE_SLUG}
        heading={t.confirmHeading}
        body={t.confirmBody}
        confirmLabel={t.confirm}
        confirmingLabel={t.deleting}
        cancelLabel={t.cancel}
        onConfirm={deleteAccount}
      />
    </div>
  )
}
