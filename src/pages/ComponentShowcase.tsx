import { useState } from 'preact/hooks'
import { toast } from 'sonner'
import { Button, Form, Input, Sidebar } from '../components/ui'

export default function ComponentShowcase() {
  const [inputValue, setInputValue] = useState('')
  const [inputWithError, setInputWithError] = useState('')
  const [error, setError] = useState('')

  const handleInputChange = (e: Event) => {
    const value = (e.target as HTMLInputElement).value
    setInputValue(value)
  }

  const handleErrorInputChange = (e: Event) => {
    const value = (e.target as HTMLInputElement).value
    setInputWithError(value)

    if (value.length < 3) {
      setError('Must be at least 3 characters')
    } else {
      setError('')
    }
  }

  return (
    <div class="space-y-8">
      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-3xl font-bold">UI Components Showcase</h2>
        <p class="text-lg text-gray-600 mt-2">This is a developer showcase for all UI components in the system.</p>
      </div>

      {/* Typography Showcase */}
      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-2xl font-semibold">Typography Components</h2>

        <div class="space-y-6 mt-6">
          <div>
            <p class="text-sm text-gray-500 mb-3">h2s</p>
            <div class="space-y-3">
              <h2 class="text-3xl font-bold">h2 Level 1</h2>
              <h2 class="text-2xl font-semibold">h2 Level 2</h2>
              <h2 class="text-xl font-semibold">h2 Level 3</h2>
              <h2 class="text-lg font-medium">h2 Level 4</h2>
              <h2 class="text-base font-medium">h2 Level 5</h2>
              <h2 class="text-sm font-medium">h2 Level 6</h2>
            </div>
          </div>

          <div>
            <p class="text-sm text-gray-500 mb-3">h2 Sizes</p>
            <div class="space-y-3">
              <h2 class="text-2xl font-semibold">Custom 4XL Size</h2>
              <h2 class="text-xl font-semibold">Success Colored h2</h2>
              <h2 class="text-lg font-medium">Centered Normal Weight</h2>
            </div>
          </div>

          <div>
            <p class="text-sm text-gray-500 mb-3">p Variants</p>
            <div class="space-y-3">
              <p class="text-lg">Lead text - larger and more prominent for introductions</p>
              <p class="text-base">Body text - the standard text used in most content</p>
              <p class="text-sm">Caption text - smaller text for captions and metadata</p>
              <p class="text-xs">Small text - the smallest text size available</p>
            </div>
          </div>

          <div>
            <p class="text-sm text-gray-500 mb-3">p Colors & Styles</p>
            <div class="space-y-2">
              <p class="text-blue-600">Primary text color</p>
              <p class="text-gray-700">Secondary text color</p>
              <p class="text-gray-500">Muted text color</p>
              <p>Success text color</p>
              <p class="text-yellow-600">Warning text color</p>
              <p class="text-red-600">Danger text color</p>
              <p class="font-bold">Bold text weight</p>
              <p class="underline">Underlined text</p>
              <p class="uppercase">Uppercase text</p>
              <p class="truncate w-48">
                This is a very long text that will be truncated when it exceeds the container width
              </p>
            </div>
          </div>

          <div>
            <p class="text-sm text-gray-500 mb-3">p Elements</p>
            <div class="space-y-2">
              <p class="block">Paragraph element</p>
              <p class="inline">Span element (inline)</p>
              <p class="font-bold">Strong element</p>
              <p class="italic">Emphasized element</p>
              <p class="text-xs">Small element</p>
            </div>
          </div>
        </div>
      </div>

      {/* Button Showcase */}
      <div class="bg-white rounded-lg shadow p-6">
        <h4 class="text-md font-medium mb-4">Button Variants</h4>

        <div class="space-y-4">
          <div>
            <h5 class="text-sm font-medium text-gray-700 mb-2">Primary Buttons</h5>
            <div class="flex flex-wrap gap-2">
              <Button variant="primary" size="sm">
                Small Primary
              </Button>
              <Button variant="primary" size="md">
                Medium Primary
              </Button>
              <Button variant="primary" size="lg">
                Large Primary
              </Button>
            </div>
          </div>

          <div>
            <h5 class="text-sm font-medium text-gray-700 mb-2">Secondary Buttons</h5>
            <div class="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm">
                Small Secondary
              </Button>
              <Button variant="secondary" size="md">
                Medium Secondary
              </Button>
              <Button variant="secondary" size="lg">
                Large Secondary
              </Button>
            </div>
          </div>

          <div>
            <h5 class="text-sm font-medium text-gray-700 mb-2">Outline Buttons</h5>
            <div class="flex flex-wrap gap-2">
              <Button variant="outline" size="sm">
                Small Outline
              </Button>
              <Button variant="outline" size="md">
                Medium Outline
              </Button>
              <Button variant="outline" size="lg">
                Large Outline
              </Button>
            </div>
          </div>

          <div>
            <h5 class="text-sm font-medium text-gray-700 mb-2">Ghost Buttons</h5>
            <div class="flex flex-wrap gap-2">
              <Button variant="ghost" size="sm">
                Small Ghost
              </Button>
              <Button variant="ghost" size="md">
                Medium Ghost
              </Button>
              <Button variant="ghost" size="lg">
                Large Ghost
              </Button>
            </div>
          </div>

          <div>
            <h5 class="text-sm font-medium text-gray-700 mb-2">Danger Buttons</h5>
            <div class="flex flex-wrap gap-2">
              <Button variant="danger" size="sm">
                Small Danger
              </Button>
              <Button variant="danger" size="md">
                Medium Danger
              </Button>
              <Button variant="danger" size="lg">
                Large Danger
              </Button>
            </div>
          </div>

          <div>
            <h5 class="text-sm font-medium text-gray-700 mb-2">Disabled States</h5>
            <div class="flex flex-wrap gap-2">
              <Button variant="primary" disabled>
                Disabled Primary
              </Button>
              <Button variant="outline" disabled>
                Disabled Outline
              </Button>
              <Button variant="danger" disabled>
                Disabled Danger
              </Button>
            </div>
          </div>
          <div>
            <h5 class="text-sm font-medium text-gray-700 mb-2">Toast Notifications</h5>
            <div class="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => toast.success('Success! Operation completed successfully.')}>
                Success Toast
              </Button>
              <Button variant="secondary" onClick={() => toast.error('Error! Something went wrong.')}>
                Error Toast
              </Button>
              <Button variant="outline" onClick={() => toast.info('Info: This is an informational message.')}>
                Info Toast
              </Button>
              <Button variant="secondary" onClick={() => toast.warning('Warning: Please check your input.')}>
                Warning Toast
              </Button>
              <Button variant="outline" onClick={() => toast.loading('Loading...', { duration: 2000 })}>
                Loading Toast
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Input Showcase */}
      <div class="bg-white rounded-lg shadow p-6">
        <h4 class="text-md font-medium mb-4">Input Components</h4>

        <div class="space-y-6 max-w-md">
          <div>
            <h5 class="text-sm font-medium text-gray-700 mb-3">Basic Inputs</h5>
            <div class="space-y-4">
              <Input label="Small Input" placeholder="Small size input" size="sm" />
              <Input label="Medium Input" placeholder="Medium size input" size="md" />
              <Input label="Large Input" placeholder="Large size input" size="lg" />
            </div>
          </div>

          <div>
            <h5 class="text-sm font-medium text-gray-700 mb-3">Input with Value</h5>
            <Input
              label="Controlled Input"
              placeholder="Type something..."
              value={inputValue}
              onInput={handleInputChange}
              helperText="This input is controlled by state"
            />
            <p class="mt-2 text-sm text-gray-500">Current value: "{inputValue}"</p>
          </div>

          <div>
            <h5 class="text-sm font-medium text-gray-700 mb-3">Required Input</h5>
            <Input
              label="Required Field"
              placeholder="This field is required"
              required
              helperText="This field has a required indicator"
            />
          </div>

          <div>
            <h5 class="text-sm font-medium text-gray-700 mb-3">Input with Error</h5>
            <Input
              label="Validation Input"
              placeholder="Type at least 3 characters"
              value={inputWithError}
              onInput={handleErrorInputChange}
              error={error}
              helperText={!error ? 'Helper text appears when no error' : undefined}
            />
          </div>

          <div>
            <h5 class="text-sm font-medium text-gray-700 mb-3">Different Input Types</h5>
            <div class="space-y-4">
              <Input label="Email" type="email" placeholder="user@example.com" />
              <Input label="Password" type="password" placeholder="••••••••" />
              <Input label="Number" type="number" placeholder="123" />
              <Input label="Search" type="search" placeholder="Search something..." />
            </div>
          </div>

          <div>
            <h5 class="text-sm font-medium text-gray-700 mb-3">Disabled Input</h5>
            <Input label="Disabled Input" placeholder="This input is disabled" disabled value="Cannot be edited" />
          </div>
        </div>
      </div>

      {/* div Showcase */}
      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-2xl font-semibold">div Component</h2>

        <div class="space-y-6 mt-6">
          <div>
            <p class="text-sm text-gray-500 mb-3">Different Container Sizes</p>
            <div class="space-y-4">
              <div class="bg-gray-100 p-2">
                <div class="max-w-sm bg-blue-50 border border-blue-200 p-4">
                  <p>Small Container (max-w-sm)</p>
                </div>
              </div>

              <div class="bg-gray-100 p-2">
                <div class="max-w-md bg-green-50 border border-green-200 p-4">
                  <p>Medium Container (max-w-md)</p>
                </div>
              </div>

              <div class="bg-gray-100 p-2">
                <div class="max-w-4xl bg-yellow-50 border border-yellow-200 p-4">
                  <p>Large Container (max-w-4xl) - Default size</p>
                </div>
              </div>

              <div class="bg-gray-100 p-2">
                <div class="max-w-6xl bg-purple-50 border border-purple-200 p-4">
                  <p>Extra Large Container (max-w-6xl)</p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <p class="text-sm text-gray-500 mb-3">Containers with Different Padding</p>
            <div class="space-y-4">
              <div class="bg-gray-100 p-2">
                <div class="max-w-md bg-red-50 border border-red-200 p-2">
                  <p>Small Padding</p>
                </div>
              </div>

              <div class="bg-gray-100 p-2">
                <div class="max-w-md bg-indigo-50 border border-indigo-200 p-6">
                  <p>Large Padding</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Form Components Showcase */}
      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-2xl font-semibold">Form Components</h2>

        <div class="space-y-8 mt-6">
          <div>
            <p class="text-sm text-gray-500 mb-4">Basic Form Example</p>
            <div class="max-w-md p-4 bg-gray-50 border border-gray-200">
              <Form onSubmit={(e) => console.log('Form submitted!', e)}>
                <div>
                  <Input label="Username" placeholder="Enter your username" required />
                </div>

                <div>
                  <Input label="Password" type="password" placeholder="Enter your password" required />
                </div>

                <div class="flex gap-3">
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary">
                    Sign In
                  </Button>
                </div>
              </Form>
            </div>
          </div>

          <div>
            <p class="text-sm text-gray-500 mb-4">Advanced Form Example</p>
            <div class="max-w-4xl p-6 bg-gray-50 border border-gray-200">
              <Form spacing="lg" onSubmit={(e) => console.log('Advanced form submitted!', e)}>
                <div class="space-y-6">
                  <div>
                    <h3 class="text-lg font-medium text-gray-900 mb-2">Personal Information</h3>
                    <p class="text-sm text-gray-600 mb-4">Please provide your basic information</p>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Input label="First Name" placeholder="John" required />
                      </div>

                      <div>
                        <Input label="Last Name" placeholder="Doe" required />
                      </div>
                    </div>

                    <div>
                      <Input label="Email Address" type="email" placeholder="john.doe@example.com" required />
                    </div>
                  </div>

                  <div>
                    <h3 class="text-lg font-medium text-gray-900 mb-2">Contact Details</h3>
                    <p class="text-sm text-gray-600 mb-4">How can we reach you?</p>
                    <div>
                      <Input label="Phone Number" type="tel" placeholder="+1 (555) 123-4567" />
                    </div>

                    <div>
                      <Input label="Company" placeholder="Acme Corp" />
                    </div>
                  </div>
                </div>

                <div class="flex justify-between items-center mt-6">
                  <Button type="button" variant="ghost">
                    Save Draft
                  </Button>

                  <div class="flex gap-3">
                    <Button type="button" variant="outline">
                      Cancel
                    </Button>
                    <Button type="submit" variant="primary">
                      Submit Application
                    </Button>
                  </div>
                </div>
              </Form>
            </div>
          </div>

          <div>
            <p class="text-sm text-gray-500 mb-4">Form Actions Alignment Options</p>
            <div class="space-y-4">
              <div class="max-w-md p-3 bg-gray-50 border border-gray-200">
                <p class="text-xs text-gray-500 mb-2">Left Aligned</p>
                <div class="flex justify-start gap-2">
                  <Button variant="primary" size="sm">
                    Save
                  </Button>
                  <Button variant="outline" size="sm">
                    Cancel
                  </Button>
                </div>
              </div>

              <div class="max-w-md p-3 bg-gray-50 border border-gray-200">
                <p class="text-xs text-gray-500 mb-2">Center Aligned</p>
                <div class="flex justify-center gap-2">
                  <Button variant="primary" size="sm">
                    Save
                  </Button>
                  <Button variant="outline" size="sm">
                    Cancel
                  </Button>
                </div>
              </div>

              <div class="max-w-md p-3 bg-gray-50 border border-gray-200">
                <p class="text-xs text-gray-500 mb-2">Space Between</p>
                <div class="flex justify-between items-center">
                  <Button variant="ghost" size="sm">
                    Reset
                  </Button>
                  <div class="flex gap-2">
                    <Button variant="outline" size="sm">
                      Cancel
                    </Button>
                    <Button variant="primary" size="sm">
                      Save
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sidebar Component Showcase */}
      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-2xl font-semibold">Sidebar Component</h2>

        <div class="space-y-8 mt-6">
          <div>
            <p class="text-sm text-gray-500 mb-4">Interactive Sidebar with Navigation</p>
            <div class="h-96 flex border border-gray-200 rounded-lg overflow-hidden">
              <Sidebar
                width="md"
                collapsible
                defaultCollapsed={false}
                items={[
                  {
                    id: 'dashboard',
                    label: 'Dashboard',
                    icon: '📊',
                    active: true,
                    onClick: () => console.log('Dashboard clicked'),
                  },
                  {
                    id: 'sales',
                    label: 'Sales',
                    icon: '💰',
                    onClick: () => console.log('Sales clicked'),
                  },
                  {
                    id: 'products',
                    label: 'Products',
                    icon: '📦',
                    badge: '12',
                    onClick: () => console.log('Products clicked'),
                  },
                  {
                    id: 'settings',
                    label: 'Settings',
                    icon: '⚙️',
                    onClick: () => console.log('Settings clicked'),
                  },
                ]}
              />

              <div class="flex-1 p-6 bg-gray-50">
                <p class="text-lg">Try the collapse button!</p>
                <p class="text-gray-500 mt-2">
                  Click the arrow button in the sidebar header to collapse/expand the sidebar.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
