-- ============================================================
-- Supabase Migration: 20261014101000_create_chat_tables.sql
-- Description: Create conversations and messages tables with RLS and indexes
-- ============================================================

-- 1. Create Conversations Table
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL DEFAULT 'New Conversation',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create Messages Table
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'model')),
    text TEXT NOT NULL,
    model TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Create Performance Indexes
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id 
    ON public.messages(conversation_id);

CREATE INDEX IF NOT EXISTS idx_conversations_updated_at 
    ON public.conversations(updated_at DESC);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- 5. Create Policies for Public / Anon Access (Local & Web App)
DROP POLICY IF EXISTS "Public access for conversations" ON public.conversations;
CREATE POLICY "Public access for conversations" 
ON public.conversations 
FOR ALL 
USING (true) 
WITH CHECK (true);

DROP POLICY IF EXISTS "Public access for messages" ON public.messages;
CREATE POLICY "Public access for messages" 
ON public.messages 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- 6. Add Tables to Realtime Publication (Enables live updates)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'conversations'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
    END IF;
END $$;
