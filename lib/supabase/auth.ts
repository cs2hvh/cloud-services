import { createClient } from './server'
import { createClient as createBrowserClient } from './client'
import { redirect } from 'next/navigation'

export async function getUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  
  if (error || !user) {
    return null
  }
  
  return user
}

export async function getUserProfile() {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  
  if (userError || !user) {
    return null
  }

  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profileError) {
    console.log('Error fetching user profile:', profileError.message)
    return null
  }

  return { ...profile, email: user.email }
}

export async function requireAuth() {
  const user = await getUser()
  if (!user) {
    redirect('/signin')
  }
  return user
}

export async function requireAuthProfile() {
  const profile = await getUserProfile()
  if (!profile) {
    redirect('/signin')
  }
  return profile
}

// Client-side auth helpers
export function useSupabaseClient() {
  return createBrowserClient()
}

export async function signOut() {
  const supabase = createBrowserClient()
  const { error } = await supabase.auth.signOut()
  if (error) {
    console.error('Error signing out:', error.message)
    return false
  }
  return true
}

export async function signInWithEmail(email: string, password: string) {
  const supabase = createBrowserClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })
  
  if (error) {
    console.error('Error signing in:', error.message)
    return { user: null, error: error.message }
  }
  
  return { user: data.user, error: null }
}

export async function signUpWithEmail(email: string, password: string, metadata?: any) {
  const supabase = createBrowserClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: metadata
    }
  })
  
  if (error) {
    console.error('Error signing up:', error.message)
    return { user: null, error: error.message }
  }
  
  return { user: data.user, error: null }
}

export async function signInWithProvider(provider: 'github' | 'discord') {
  const supabase = createBrowserClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${window.location.origin}/api/auth/callback`
    }
  })
  
  if (error) {
    console.error(`Error signing in with ${provider}:`, error.message)
    return { url: null, error: error.message }
  }
  
  return { url: data.url, error: null }
}

export async function resetPassword(email: string) {
  const supabase = createBrowserClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`
  })
  
  if (error) {
    console.error('Error resetting password:', error.message)
    return { error: error.message }
  }
  
  return { error: null }
}