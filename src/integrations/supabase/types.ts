// ─────────────────────────────────────────────────────────────────────────────
// GENERATED TYPES — hand-applied via catalog introspection of
// supabase/migrations/20261107000001_agency_os_convergence.sql (pglite), 2026-11-07.
// Replace with: supabase gen types typescript --local > src/integrations/supabase/types.ts
// once the Supabase CLI / staging project is available. Do not edit by hand.
// ─────────────────────────────────────────────────────────────────────────────

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          value: Json
          updated_at: string
        }
        Insert: {
          key: string
          value: Json
          updated_at?: string
        }
        Update: {
          key?: string
          value?: Json
          updated_at?: string
        }
        Relationships: []
      }
      blog_posts: {
        Row: {
          id: string
          payload: Json
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          payload: Json
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          payload?: Json
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      brands: {
        Row: {
          id: string
          name: string
          payload: Json
          created_at: string
        }
        Insert: {
          id: string
          name: string
          payload?: Json
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          payload?: Json
          created_at?: string
        }
        Relationships: []
      }
      bundles: {
        Row: {
          id: string
          name: string
          payload: Json
          created_at: string
        }
        Insert: {
          id: string
          name: string
          payload?: Json
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          payload?: Json
          created_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          id: string
          name: string
          group_: string
          parent_id: string | null
          sort: number
          created_at: string
        }
        Insert: {
          id: string
          name: string
          group_?: string
          parent_id?: string | null
          sort?: number
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          group_?: string
          parent_id?: string | null
          sort?: number
          created_at?: string
        }
        Relationships: []
      }
      client_links: {
        Row: {
          client_id: number
          entity: string
          entity_id: number
        }
        Insert: {
          client_id: number
          entity: string
          entity_id: number
        }
        Update: {
          client_id?: number
          entity?: string
          entity_id?: number
        }
        Relationships: []
      }
      clients: {
        Row: {
          id: number
          name: string
          company: string | null
          email: string | null
          email_norm: string | null
          phone: string | null
          phone_norm: string | null
          city: string | null
          tags: Json
          notes: string | null
          source: string | null
          merged_into: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          name: string
          company?: string | null
          email?: string | null
          email_norm?: string | null
          phone?: string | null
          phone_norm?: string | null
          city?: string | null
          tags?: Json
          notes?: string | null
          source?: string | null
          merged_into?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          name?: string
          company?: string | null
          email?: string | null
          email_norm?: string | null
          phone?: string | null
          phone_norm?: string | null
          city?: string | null
          tags?: Json
          notes?: string | null
          source?: string | null
          merged_into?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      collections: {
        Row: {
          id: string
          name: string
          payload: Json
          created_at: string
        }
        Insert: {
          id: string
          name: string
          payload?: Json
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          payload?: Json
          created_at?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          id: number
          client_id: number
          status: string
          assignee: string | null
          priority: number
          unread: number
          last_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          client_id: number
          status?: string
          assignee?: string | null
          priority?: number
          unread?: number
          last_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          client_id?: number
          status?: string
          assignee?: string | null
          priority?: number
          unread?: number
          last_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      custom_design_page: {
        Row: {
          id: string
          content: Json
          updated_at: string
        }
        Insert: {
          id?: string
          content?: Json
          updated_at?: string
        }
        Update: {
          id?: string
          content?: Json
          updated_at?: string
        }
        Relationships: []
      }
      delivery_zones: {
        Row: {
          id: string
          name: string
          city: string
          postal_codes: string[]
          eta_days: number
          created_at: string
        }
        Insert: {
          id: string
          name: string
          city: string
          postal_codes?: string[]
          eta_days?: number
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          city?: string
          postal_codes?: string[]
          eta_days?: number
          created_at?: string
        }
        Relationships: []
      }
      homepage_sections: {
        Row: {
          id: string
          content: Json
          updated_at: string
        }
        Insert: {
          id?: string
          content?: Json
          updated_at?: string
        }
        Update: {
          id?: string
          content?: Json
          updated_at?: string
        }
        Relationships: []
      }
      inventory_meta: {
        Row: {
          product_id: string
          low_stock_threshold: number
          location: string | null
          last_updated: string
        }
        Insert: {
          product_id: string
          low_stock_threshold?: number
          location?: string | null
          last_updated?: string
        }
        Update: {
          product_id?: string
          low_stock_threshold?: number
          location?: string | null
          last_updated?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          id: number
          ref: string | null
          quote_id: number | null
          order_id: number | null
          customer: string
          items: Json
          subtotal: number
          discount: number
          tax: number
          shipping: number
          total: number
          paid: number
          status: string
          due: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          ref?: string | null
          quote_id?: number | null
          order_id?: number | null
          customer: string
          items?: Json
          subtotal?: number
          discount?: number
          tax?: number
          shipping?: number
          total?: number
          paid?: number
          status?: string
          due?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          ref?: string | null
          quote_id?: number | null
          order_id?: number | null
          customer?: string
          items?: Json
          subtotal?: number
          discount?: number
          tax?: number
          shipping?: number
          total?: number
          paid?: number
          status?: string
          due?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          id: number
          ref: string | null
          name: string
          company: string | null
          interest: string | null
          source: string | null
          contact: string | null
          email: string | null
          phone: string | null
          preferred_channel: string | null
          status: string
          owner: string | null
          note: string | null
          contact_consent: number
          is_returning: number
          identity_review: number
          consent_at: string | null
          consent_version: string | null
          landing_path: string | null
          referrer: string | null
          utm_source: string | null
          utm_medium: string | null
          utm_campaign: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          ref?: string | null
          name: string
          company?: string | null
          interest?: string | null
          source?: string | null
          contact?: string | null
          email?: string | null
          phone?: string | null
          preferred_channel?: string | null
          status?: string
          owner?: string | null
          note?: string | null
          contact_consent?: number
          is_returning?: number
          identity_review?: number
          consent_at?: string | null
          consent_version?: string | null
          landing_path?: string | null
          referrer?: string | null
          utm_source?: string | null
          utm_medium?: string | null
          utm_campaign?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          ref?: string | null
          name?: string
          company?: string | null
          interest?: string | null
          source?: string | null
          contact?: string | null
          email?: string | null
          phone?: string | null
          preferred_channel?: string | null
          status?: string
          owner?: string | null
          note?: string | null
          contact_consent?: number
          is_returning?: number
          identity_review?: number
          consent_at?: string | null
          consent_version?: string | null
          landing_path?: string | null
          referrer?: string | null
          utm_source?: string | null
          utm_medium?: string | null
          utm_campaign?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      materials: {
        Row: {
          id: string
          json: Json
          created_at: string
        }
        Insert: {
          id: string
          json: Json
          created_at?: string
        }
        Update: {
          id?: string
          json?: Json
          created_at?: string
        }
        Relationships: []
      }
      media_assets: {
        Row: {
          id: string
          name: string
          url: string
          alt: string | null
          width: number | null
          height: number | null
          size_bytes: number | null
          mime: string | null
          created_at: string
        }
        Insert: {
          id: string
          name: string
          url: string
          alt?: string | null
          width?: number | null
          height?: number | null
          size_bytes?: number | null
          mime?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          url?: string
          alt?: string | null
          width?: number | null
          height?: number | null
          size_bytes?: number | null
          mime?: string | null
          created_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          id: number
          conversation_id: number
          channel: string
          direction: string
          author: string | null
          body: string
          meta: Json | null
          created_at: string
        }
        Insert: {
          id?: number
          conversation_id: number
          channel: string
          direction?: string
          author?: string | null
          body: string
          meta?: Json | null
          created_at?: string
        }
        Update: {
          id?: number
          conversation_id?: number
          channel?: string
          direction?: string
          author?: string | null
          body?: string
          meta?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      option_sets: {
        Row: {
          id: string
          name: string
          payload: Json
          created_at: string
        }
        Insert: {
          id: string
          name: string
          payload?: Json
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          payload?: Json
          created_at?: string
        }
        Relationships: []
      }
      order_events: {
        Row: {
          id: number
          order_id: number
          kind: string
          note: string | null
          actor: string
          created_at: string
        }
        Insert: {
          id?: number
          order_id: number
          kind: string
          note?: string | null
          actor?: string
          created_at?: string
        }
        Update: {
          id?: number
          order_id?: number
          kind?: string
          note?: string | null
          actor?: string
          created_at?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          id: number
          ref: string | null
          customer: string
          items: Json
          total: number
          status: string
          stage: string
          owner: string
          due: string | null
          tracking_token_hash: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          ref?: string | null
          customer: string
          items: Json
          total?: number
          status?: string
          stage?: string
          owner?: string
          due?: string | null
          tracking_token_hash?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          ref?: string | null
          customer?: string
          items?: Json
          total?: number
          status?: string
          stage?: string
          owner?: string
          due?: string | null
          tracking_token_hash?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      page_blocks: {
        Row: {
          id: number
          page_id: number
          type: string
          props: Json
          sort: number
        }
        Insert: {
          id?: number
          page_id: number
          type: string
          props?: Json
          sort?: number
        }
        Update: {
          id?: number
          page_id?: number
          type?: string
          props?: Json
          sort?: number
        }
        Relationships: []
      }
      page_versions: {
        Row: {
          id: number
          page_id: number
          snapshot: Json
          note: string | null
          who: string
          created_at: string
        }
        Insert: {
          id?: number
          page_id: number
          snapshot: Json
          note?: string | null
          who?: string
          created_at?: string
        }
        Update: {
          id?: number
          page_id?: number
          snapshot?: Json
          note?: string | null
          who?: string
          created_at?: string
        }
        Relationships: []
      }
      pages: {
        Row: {
          id: number
          slug: string
          title: string
          status: string
          seo_title: string | null
          seo_desc: string | null
          theme: Json | null
          published_snapshot: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          slug: string
          title: string
          status?: string
          seo_title?: string | null
          seo_desc?: string | null
          theme?: Json | null
          published_snapshot?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          slug?: string
          title?: string
          status?: string
          seo_title?: string | null
          seo_desc?: string | null
          theme?: Json | null
          published_snapshot?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          id: number
          invoice_id: number
          amount: number
          method: string
          reference: string | null
          note: string | null
          created_at: string
        }
        Insert: {
          id?: number
          invoice_id: number
          amount: number
          method?: string
          reference?: string | null
          note?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          invoice_id?: number
          amount?: number
          method?: string
          reference?: string | null
          note?: string | null
          created_at?: string
        }
        Relationships: []
      }
      price_lists: {
        Row: {
          id: string
          name: string
          channel: string | null
          currency: string
          items: Json
          created_at: string
        }
        Insert: {
          id: string
          name: string
          channel?: string | null
          currency?: string
          items?: Json
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          channel?: string | null
          currency?: string
          items?: Json
          created_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          id: string
          payload: Json
          name: string | null
          series_id: string | null
          category_id: string | null
          price: number
          stock_qty: number
          in_stock: boolean
          updated_at: string
        }
        Insert: {
          id: string
          payload: Json
          name?: string | null
          series_id?: string | null
          category_id?: string | null
          price?: number
          stock_qty?: number
          in_stock?: boolean
          updated_at?: string
        }
        Update: {
          id?: string
          payload?: Json
          name?: string | null
          series_id?: string | null
          category_id?: string | null
          price?: number
          stock_qty?: number
          in_stock?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          id: string
          payload: Json
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          payload: Json
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          payload?: Json
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      purchase_orders: {
        Row: {
          id: string
          supplier_id: string
          status: string
          items: Json
          total: number
          expected_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          supplier_id: string
          status?: string
          items?: Json
          total?: number
          expected_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          supplier_id?: string
          status?: string
          items?: Json
          total?: number
          expected_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      quote_templates: {
        Row: {
          id: string
          name: string
          template: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          name: string
          template: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          template?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      quote_versions: {
        Row: {
          id: number
          quote_id: number
          version: number
          snapshot: Json
          actor: string | null
          action: string | null
          created_at: string
        }
        Insert: {
          id?: number
          quote_id: number
          version: number
          snapshot: Json
          actor?: string | null
          action?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          quote_id?: number
          version?: number
          snapshot?: Json
          actor?: string | null
          action?: string | null
          created_at?: string
        }
        Relationships: []
      }
      quotes: {
        Row: {
          id: number
          ref: string | null
          customer: string
          contact: string | null
          lead_id: number | null
          items: Json
          total: number
          status: string
          source: string
          note: string | null
          audit: Json
          details: Json
          version: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          ref?: string | null
          customer: string
          contact?: string | null
          lead_id?: number | null
          items: Json
          total?: number
          status?: string
          source?: string
          note?: string | null
          audit?: Json
          details?: Json
          version?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          ref?: string | null
          customer?: string
          contact?: string | null
          lead_id?: number | null
          items?: Json
          total?: number
          status?: string
          source?: string
          note?: string | null
          audit?: Json
          details?: Json
          version?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      returns: {
        Row: {
          id: number
          ref: string | null
          order_id: number | null
          customer: string | null
          item: string | null
          reason: string | null
          state: string
          refund_amount: number
          resolution: string | null
          restock: boolean
          inspection_note: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          ref?: string | null
          order_id?: number | null
          customer?: string | null
          item?: string | null
          reason?: string | null
          state?: string
          refund_amount?: number
          resolution?: string | null
          restock?: boolean
          inspection_note?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          ref?: string | null
          order_id?: number | null
          customer?: string | null
          item?: string | null
          reason?: string | null
          state?: string
          refund_amount?: number
          resolution?: string | null
          restock?: boolean
          inspection_note?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      sales_channels: {
        Row: {
          id: string
          name: string
          kind: string
          payload: Json
          created_at: string
        }
        Insert: {
          id: string
          name: string
          kind?: string
          payload?: Json
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          kind?: string
          payload?: Json
          created_at?: string
        }
        Relationships: []
      }
      saved_sections: {
        Row: {
          id: number
          name: string
          category: string
          tags: Json
          block: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          name: string
          category?: string
          tags?: Json
          block: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          name?: string
          category?: string
          tags?: Json
          block?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      series: {
        Row: {
          id: string
          name: string
          collection_id: string | null
          payload: Json
          created_at: string
        }
        Insert: {
          id: string
          name: string
          collection_id?: string | null
          payload?: Json
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          collection_id?: string | null
          payload?: Json
          created_at?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          id: string
          json: Json
          created_at: string
        }
        Insert: {
          id: string
          json: Json
          created_at?: string
        }
        Update: {
          id?: string
          json?: Json
          created_at?: string
        }
        Relationships: []
      }
      showrooms: {
        Row: {
          id: string
          payload: Json
          created_at: string
        }
        Insert: {
          id: string
          payload: Json
          created_at?: string
        }
        Update: {
          id?: string
          payload?: Json
          created_at?: string
        }
        Relationships: []
      }
      site_visits: {
        Row: {
          id: number
          ref: string
          lead_id: number
          client_id: number
          scheduled_at: string
          timezone: string
          address: string
          owner: string
          status: string
          notes: string | null
          outcome: string | null
          reminder_at: string | null
          reminder_task_id: number | null
          audit: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          ref: string
          lead_id: number
          client_id: number
          scheduled_at: string
          timezone?: string
          address: string
          owner?: string
          status?: string
          notes?: string | null
          outcome?: string | null
          reminder_at?: string | null
          reminder_task_id?: number | null
          audit?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          ref?: string
          lead_id?: number
          client_id?: number
          scheduled_at?: string
          timezone?: string
          address?: string
          owner?: string
          status?: string
          notes?: string | null
          outcome?: string | null
          reminder_at?: string | null
          reminder_task_id?: number | null
          audit?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          id: number
          product_id: string
          delta: number
          reason: string
          note: string | null
          actor: string
          created_at: string
        }
        Insert: {
          id?: number
          product_id: string
          delta: number
          reason: string
          note?: string | null
          actor?: string
          created_at?: string
        }
        Update: {
          id?: number
          product_id?: string
          delta?: number
          reason?: string
          note?: string | null
          actor?: string
          created_at?: string
        }
        Relationships: []
      }
      stock_transfers: {
        Row: {
          id: string
          from_zone: string
          to_zone: string
          status: string
          items: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          from_zone?: string
          to_zone: string
          status?: string
          items?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          from_zone?: string
          to_zone?: string
          status?: string
          items?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          id: string
          name: string
          contact_name: string | null
          email: string | null
          phone: string | null
          city: string | null
          payload: Json
          created_at: string
        }
        Insert: {
          id: string
          name: string
          contact_name?: string | null
          email?: string | null
          phone?: string | null
          city?: string | null
          payload?: Json
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          contact_name?: string | null
          email?: string | null
          phone?: string | null
          city?: string | null
          payload?: Json
          created_at?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          id: number
          client_id: number | null
          lead_id: number | null
          quote_id: number | null
          order_id: number | null
          site_visit_id: number | null
          title: string
          due: string | null
          owner: string
          priority: string
          done: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          client_id?: number | null
          lead_id?: number | null
          quote_id?: number | null
          order_id?: number | null
          site_visit_id?: number | null
          title: string
          due?: string | null
          owner?: string
          priority?: string
          done?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          client_id?: number | null
          lead_id?: number | null
          quote_id?: number | null
          order_id?: number | null
          site_visit_id?: number | null
          title?: string
          due?: string | null
          owner?: string
          priority?: string
          done?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      track_events: {
        Row: {
          id: number
          page_id: number | null
          slug: string
          kind: string
          label: string | null
          href: string | null
          cid: string | null
          ref: string | null
          utm_source: string | null
          utm_medium: string | null
          utm_campaign: string | null
          pct: number | null
          created_at: string
        }
        Insert: {
          id?: number
          page_id?: number | null
          slug: string
          kind: string
          label?: string | null
          href?: string | null
          cid?: string | null
          ref?: string | null
          utm_source?: string | null
          utm_medium?: string | null
          utm_campaign?: string | null
          pct?: number | null
          created_at?: string
        }
        Update: {
          id?: number
          page_id?: number | null
          slug?: string
          kind?: string
          label?: string | null
          href?: string | null
          cid?: string | null
          ref?: string | null
          utm_source?: string | null
          utm_medium?: string | null
          utm_campaign?: string | null
          pct?: number | null
          created_at?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          user_id: string
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          user_id: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          user_id?: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          user_id: string
          role: string
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          role: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          role?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      virtual_showroom_page: {
        Row: {
          id: string
          content: Json
          updated_at: string
        }
        Insert: {
          id?: string
          content?: Json
          updated_at?: string
        }
        Update: {
          id?: string
          content?: Json
          updated_at?: string
        }
        Relationships: []
      }
      warranty_page: {
        Row: {
          id: string
          content: Json
          updated_at: string
        }
        Insert: {
          id?: string
          content?: Json
          updated_at?: string
        }
        Update: {
          id?: string
          content?: Json
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_overview: {
        Args: {}
        Returns: Json
      }
      catalog_overrides: {
        Args: {}
        Returns: { id: string; price: number; stock_qty: number; in_stock: boolean }[]
      }
      my_role: {
        Args: {}
        Returns: string
      }
      has_role: {
        Args: { need: string }
        Returns: boolean
      }
      my_caps: {
        Args: {}
        Returns: string[]
      }
      has_cap: {
        Args: { need: string }
        Returns: boolean
      }
      require_cap: {
        Args: { need: string }
        Returns: undefined
      }
      product_update: {
        Args: { p_id: string; p_price?: number; p_stock_qty?: number; p_name?: string }
        Returns: Database['public']['Tables']['products']['Row']
      }
      inventory_apply: {
        Args: { p_product_id: string; p_delta: number; p_reason: string; p_note?: string }
        Returns: Database['public']['Tables']['products']['Row']
      }
      order_stage: {
        Args: { p_order_id: number; p_stage: string; p_note?: string }
        Returns: Database['public']['Tables']['orders']['Row']
      }
      quote_invoice_snapshot: {
        Args: { p_quote_id: number }
        Returns: Database['public']['Tables']['invoices']['Row']
      }
      invoice_apply_payment: {
        Args: { p_invoice_id: number; p_amount: number; p_method?: string; p_reference?: string }
        Returns: Database['public']['Tables']['invoices']['Row']
      }
      client_merge: {
        Args: { p_into: number; p_from: number }
        Returns: Database['public']['Tables']['clients']['Row']
      }
      bootstrap_owner: {
        Args: { p_user: string; p_name?: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

