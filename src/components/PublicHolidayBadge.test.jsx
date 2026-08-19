import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PublicHolidayBadge from './PublicHolidayBadge'

describe('PublicHolidayBadge', () => {
  it('renders a PH badge that names the holiday and its status', () => {
    render(<PublicHolidayBadge name="Heritage Day" />)
    expect(screen.getByRole('button')).toHaveTextContent('PH')
    expect(screen.getByRole('tooltip')).toHaveTextContent('Heritage Day')
    expect(screen.getByRole('tooltip')).toHaveTextContent('Public holiday')
  })

  it('marks an observed holiday as observed, without the parenthetical', () => {
    render(<PublicHolidayBadge name="National Women's Day (observed)" />)
    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).toHaveTextContent("National Women's Day")
    expect(tooltip).toHaveTextContent('Observed public holiday')
    expect(tooltip.textContent).not.toContain('(observed)')
  })

  // The tooltip is hover-revealed via CSS, which never fires on touch — so
  // tapping has to pin it open, and tapping again has to put it away.
  it('toggles the tooltip open and closed on click', async () => {
    const user = userEvent.setup()
    render(<PublicHolidayBadge name="Heritage Day" />)
    const button = screen.getByRole('button')
    expect(screen.getByRole('tooltip').className).toContain('hidden')

    await user.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('tooltip').className).not.toContain('hidden')

    await user.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('tooltip').className).toContain('hidden')
  })

  it('closes a pinned tooltip on an outside click', async () => {
    const user = userEvent.setup()
    render(<div><PublicHolidayBadge name="Heritage Day" /><button>elsewhere</button></div>)

    await user.click(screen.getByRole('button', { name: /Heritage Day/ }))
    expect(screen.getByRole('tooltip').className).not.toContain('hidden')

    await user.click(screen.getByRole('button', { name: 'elsewhere' }))
    expect(screen.getByRole('tooltip').className).toContain('hidden')
  })

  it('falls back to a generic label when the holiday has no name', () => {
    render(<PublicHolidayBadge name="" />)
    expect(screen.getByRole('button')).toHaveAccessibleName('Public holiday — Public holiday')
  })
})
