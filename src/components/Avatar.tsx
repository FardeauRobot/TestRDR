import type { Member } from '../types'
import { cx } from '../lib/util'

export function Avatar({ member, size }: { member: Pick<Member, 'emoji' | 'color'>; size?: 'sm' | 'lg' }) {
  return (
    <div
      className={cx('avatar', size === 'lg' && 'lg', size === 'sm' && 'sm')}
      style={{ background: member.color + '33', boxShadow: `inset 0 0 0 2px ${member.color}55` }}
    >
      <span>{member.emoji}</span>
    </div>
  )
}
