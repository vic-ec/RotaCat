import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import LeaveTypeIcon from './LeaveTypeIcon'
import { LEAVE_TYPE_OPTIONS } from '../lib/leaveRequests'
import { LEAVE_GROUP_OPTIONS, leaveTypeColor } from '../lib/leaveMatrix'

describe('LeaveTypeIcon', () => {
  it('draws an icon for every leave type and every legend group', () => {
    for (const { value } of LEAVE_TYPE_OPTIONS) {
      const { container, unmount } = render(<LeaveTypeIcon leaveType={value} />)
      expect(container.querySelector(`[data-leave-icon="${value}"] svg`)).not.toBeNull()
      unmount()
    }
    for (const { key } of LEAVE_GROUP_OPTIONS) {
      const { container, unmount } = render(<LeaveTypeIcon groupKey={key} />)
      expect(container.querySelector('svg')).not.toBeNull()
      unmount()
    }
  })

  it('takes its group colour, or the colour it is given when bare', () => {
    const { container } = render(<LeaveTypeIcon leaveType="sick" />)
    expect(container.firstChild.style.color).toBe('var(--leave-ink-sick)')
    expect(leaveTypeColor('sick')).toBe('#DC2626')
    const bare = render(<LeaveTypeIcon leaveType="annual" variant="bare" color="#FFFFFF" />)
    expect(bare.container.querySelector('svg').style.color).toBe('rgb(255, 255, 255)')
  })
})
