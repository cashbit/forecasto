import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { AmountDisplay } from '@/components/common/AmountDisplay'

describe('AmountDisplay', () => {
  it('renders positive amounts in green', () => {
    render(<AmountDisplay amount="1500.00" />)
    const element = screen.getByText(/1\.500,00/)
    expect(element).toHaveClass('text-income')
  })

  it('renders negative amounts in red', () => {
    render(<AmountDisplay amount="-500.00" />)
    const element = screen.getByText(/500,00/)
    expect(element).toHaveClass('text-expense')
  })

  it('formats currency correctly in Italian locale', () => {
    render(<AmountDisplay amount="1234.56" />)
    expect(screen.getByText(/1\.234,56/)).toBeInTheDocument()
  })

  it('handles zero amount', () => {
    render(<AmountDisplay amount="0" />)
    const element = screen.getByText(/0,00/)
    expect(element).toHaveClass('text-income')
  })

  it('handles string amounts', () => {
    render(<AmountDisplay amount="999.99" />)
    expect(screen.getByText(/999,99/)).toBeInTheDocument()
  })

  it('handles number amounts', () => {
    render(<AmountDisplay amount={123.45} />)
    expect(screen.getByText(/123,45/)).toBeInTheDocument()
  })
})
