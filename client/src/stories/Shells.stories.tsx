import type { Meta, StoryObj } from '@storybook/react';
import LoginPage from '@/pages/login/Login';
import SignupPage from '@/pages/signup/Signup';
import UserNav from '@/shared/UserNav/UserNav';

const noop = () => {};

const meta = {
  title: 'Shared Components/Shells',
  parameters: {
    docs: {
      description: {
        component: 'Auth pages and the user navigation shell.',
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Login: Story = {
  render: () => <LoginPage />,
};

export const Signup: Story = {
  render: () => <SignupPage />,
};

export const Navigation: Story = {
  render: () => (
    <UserNav
      collapsed={false}
      onToggle={noop}
    />
  ),
};
