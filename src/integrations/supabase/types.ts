// ─────────────────────────────────────────────────────────────────────────────
// GENERATED TYPES — hand-applied via catalog introspection of
// supabase/migrations/20261107000001_agency_os_convergence.sql (pglite), 2026-11-07.
// Replace with: supabase gen types typescript --local > src/integrations/supabase/types.ts
// once the Supabase CLI / staging project is available. Until then, blocks for
// draft_orders (0008), exchanges and claims (0009) were written by hand from their
// migrations on 2026-11-07 under the same no-egress constraint — regenerate to reconcile.
// project_cost_codes and project_actuals (0013) were hand-applied the same way on 2026-11-08.
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
          visible: boolean
          payload: Json
          created_at: string
        }
        Insert: {
          id: string
          name: string
          group_?: string
          parent_id?: string | null
          sort?: number
          visible?: boolean
          payload?: Json
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          group_?: string
          parent_id?: string | null
          sort?: number
          visible?: boolean
          payload?: Json
          created_at?: string
        }
        Relationships: []
      }
      claims: {
        Row: {
          id: number
          ref: string | null
          order_id: number | null
          customer: string
          customer_email: string | null
          customer_phone: string | null
          city: string | null
          product_name: string
          product_id: string | null
          type: string
          issue: string
          status: string
          assessment_note: string | null
          resolution_note: string | null
          resolution_cost: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          ref?: string | null
          order_id?: number | null
          customer: string
          customer_email?: string | null
          customer_phone?: string | null
          city?: string | null
          product_name: string
          product_id?: string | null
          type: string
          issue: string
          status?: string
          assessment_note?: string | null
          resolution_note?: string | null
          resolution_cost?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          ref?: string | null
          order_id?: number | null
          customer?: string
          customer_email?: string | null
          customer_phone?: string | null
          city?: string | null
          product_name?: string
          product_id?: string | null
          type?: string
          issue?: string
          status?: string
          assessment_note?: string | null
          resolution_note?: string | null
          resolution_cost?: number | null
          created_at?: string
          updated_at?: string
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
          kind: string
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
          kind?: string
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
          kind?: string
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
      draft_orders: {
        Row: {
          id: number
          ref: string | null
          customer: string
          customer_phone: string | null
          customer_email: string | null
          city: string | null
          address: string | null
          items: Json
          subtotal: number
          shipping: number
          total: number
          channel_id: string | null
          note: string | null
          status: string
          converted_order_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          ref?: string | null
          customer: string
          customer_phone?: string | null
          customer_email?: string | null
          city?: string | null
          address?: string | null
          items?: Json
          subtotal?: number
          shipping?: number
          total?: number
          channel_id?: string | null
          note?: string | null
          status?: string
          converted_order_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          ref?: string | null
          customer?: string
          customer_phone?: string | null
          customer_email?: string | null
          city?: string | null
          address?: string | null
          items?: Json
          subtotal?: number
          shipping?: number
          total?: number
          channel_id?: string | null
          note?: string | null
          status?: string
          converted_order_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      exchanges: {
        Row: {
          id: number
          ref: string | null
          order_id: number | null
          return_id: number | null
          customer: string
          customer_email: string | null
          customer_phone: string | null
          city: string | null
          incoming: Json
          outgoing: Json
          reason: string | null
          status: string
          price_difference: number
          difference_settled: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          ref?: string | null
          order_id?: number | null
          return_id?: number | null
          customer: string
          customer_email?: string | null
          customer_phone?: string | null
          city?: string | null
          incoming?: Json
          outgoing?: Json
          reason?: string | null
          status?: string
          price_difference?: number
          difference_settled?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          ref?: string | null
          order_id?: number | null
          return_id?: number | null
          customer?: string
          customer_email?: string | null
          customer_phone?: string | null
          city?: string | null
          incoming?: Json
          outgoing?: Json
          reason?: string | null
          status?: string
          price_difference?: number
          difference_settled?: boolean
          created_at?: string
          updated_at?: string
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
          folder: string | null
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
          folder?: string | null
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
          folder?: string | null
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
          subtotal: number
          shipping: number
          payment_method: string
          customer_email: string | null
          customer_phone: string | null
          address: string | null
          city: string | null
          courier_name: string | null
          tracking_number: string | null
          internal_notes: string | null
          discount_pct: number
          discount_amount: number
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
          subtotal?: number
          shipping?: number
          payment_method?: string
          customer_email?: string | null
          customer_phone?: string | null
          address?: string | null
          city?: string | null
          courier_name?: string | null
          tracking_number?: string | null
          internal_notes?: string | null
          discount_pct?: number
          discount_amount?: number
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
          subtotal?: number
          shipping?: number
          payment_method?: string
          customer_email?: string | null
          customer_phone?: string | null
          address?: string | null
          city?: string | null
          courier_name?: string | null
          tracking_number?: string | null
          internal_notes?: string | null
          discount_pct?: number
          discount_amount?: number
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
          version: number
          snapshot: Json
          note: string | null
          who: string
          action: string
          created_at: string
        }
        Insert: {
          id?: number
          page_id: number
          version?: number
          snapshot: Json
          note?: string | null
          who?: string
          action?: string
          created_at?: string
        }
        Update: {
          id?: number
          page_id?: number
          version?: number
          snapshot?: Json
          note?: string | null
          who?: string
          action?: string
          created_at?: string
        }
        Relationships: []
      }
      pages: {
        Row: {
          id: number
          slug: string
          kind: string
          title: string
          status: string
          seo_title: string | null
          seo_desc: string | null
          theme: Json | null
          seo: Json
          published_at: string | null
          published_snapshot: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          slug: string
          kind?: string
          title: string
          status?: string
          seo_title?: string | null
          seo_desc?: string | null
          theme?: Json | null
          seo?: Json
          published_at?: string | null
          published_snapshot?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          slug?: string
          kind?: string
          title?: string
          status?: string
          seo_title?: string | null
          seo_desc?: string | null
          theme?: Json | null
          seo?: Json
          published_at?: string | null
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
          status: string
          payload: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          name: string
          channel?: string | null
          currency?: string
          items?: Json
          status?: string
          payload?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          channel?: string | null
          currency?: string
          items?: Json
          status?: string
          payload?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          id: string
          payload: Json
          name: string | null
          sku: string | null
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
          sku?: string | null
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
          sku?: string | null
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
          // Hand-added for local migration 00022; regenerate against staging.
          revision: number
          production_updated_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          payload: Json
          status?: string
          revision?: number
          production_updated_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          payload?: Json
          status?: string
          revision?: number
          production_updated_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_qc_inspections: {
        Row: {
          id: string
          project_id: string
          result: string
          notes: string
          inspected_by: string
          inspected_by_email: string
          revision: number
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          result: string
          notes?: string
          inspected_by: string
          inspected_by_email?: string
          revision?: number
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          result?: string
          notes?: string
          inspected_by?: string
          inspected_by_email?: string
          revision?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_qc_inspections_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          }
        ]
      }
      project_production_events: {
        Row: {
          id: number
          project_id: string
          actor: string | null
          action: string
          revision: number
          qc_result: string | null
          dispatch_vehicle: string | null
          detail: Json
          created_at: string
        }
        Insert: {
          id?: number
          project_id: string
          actor?: string | null
          action: string
          revision?: number
          qc_result?: string | null
          dispatch_vehicle?: string | null
          detail?: Json
          created_at?: string
        }
        Update: {
          id?: number
          project_id?: string
          actor?: string | null
          action?: string
          revision?: number
          qc_result?: string | null
          dispatch_vehicle?: string | null
          detail?: Json
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_production_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          }
        ]
      }
      purchase_orders: {
        Row: {
          id: string
          supplier_id: string
          status: string
          items: Json
          total: number
          expected_at: string | null
          received_at: string | null
          notes: string | null
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
          received_at?: string | null
          notes?: string | null
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
          received_at?: string | null
          notes?: string | null
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
          company: string | null
          city: string | null
          address: string | null
          customer_email: string | null
          customer_phone: string | null
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
          company?: string | null
          city?: string | null
          address?: string | null
          customer_email?: string | null
          customer_phone?: string | null
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
          company?: string | null
          city?: string | null
          address?: string | null
          customer_email?: string | null
          customer_phone?: string | null
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
          items: Json
          customer_email: string | null
          customer_phone: string | null
          city: string | null
          reason: string | null
          reason_detail: string | null
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
          items?: Json
          customer_email?: string | null
          customer_phone?: string | null
          city?: string | null
          reason?: string | null
          reason_detail?: string | null
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
          items?: Json
          customer_email?: string | null
          customer_phone?: string | null
          city?: string | null
          reason?: string | null
          reason_detail?: string | null
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
          notes: string | null
          received_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          from_zone?: string
          to_zone: string
          status?: string
          items?: Json
          notes?: string | null
          received_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          from_zone?: string
          to_zone?: string
          status?: string
          items?: Json
          notes?: string | null
          received_at?: string | null
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
      // Hand-added for local migration 00026 (warranty claims). Never inserted from
      // the client — writes go through the RPCs — but reads need the table type.
      project_warranty_claims: {
        Row: {
          id: string
          project_id: string
          warranty_id: string
          summary: string
          details: string
          status: string
          opened_on: string
          resolution: string
          closed_at: string | null
          opened_by: string | null
          updated_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          warranty_id: string
          summary: string
          details?: string
          status?: string
          opened_on?: string
          resolution?: string
          closed_at?: string | null
          opened_by?: string | null
          updated_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          warranty_id?: string
          summary?: string
          details?: string
          status?: string
          opened_on?: string
          resolution?: string
          closed_at?: string | null
          opened_by?: string | null
          updated_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_cost_codes: {
        Row: {
          id: number
          project_id: string
          code: string
          boq_section: string | null
          description: string
          created_at: string
        }
        Insert: {
          id?: number
          project_id: string
          code: string
          boq_section?: string | null
          description?: string
          created_at?: string
        }
        Update: {
          id?: number
          project_id?: string
          code?: string
          boq_section?: string | null
          description?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_cost_codes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_actuals: {
        Row: {
          id: number
          project_id: string
          cost_code: string
          description: string
          qty: number
          unit: string
          rate: number
          amount: number
          source: string
          po_ref: string | null
          incurred_on: string
          note: string
          created_at: string
        }
        Insert: {
          id?: number
          project_id: string
          cost_code: string
          description?: string
          qty?: number
          unit?: string
          rate?: number
          source?: string
          po_ref?: string | null
          incurred_on?: string
          note?: string
          created_at?: string
        }
        Update: {
          id?: number
          project_id?: string
          cost_code?: string
          description?: string
          qty?: number
          unit?: string
          rate?: number
          source?: string
          po_ref?: string | null
          incurred_on?: string
          note?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_actuals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_actuals_code_fkey"
            columns: ["project_id", "cost_code"]
            isOneToOne: false
            referencedRelation: "project_cost_codes"
            referencedColumns: ["project_id", "code"]
          },
        ]
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
        Args: Record<string, never>
        Returns: Json
      }
      catalog_overrides: {
        Args: Record<string, never>
        Returns: { id: string; price: number; stock_qty: number; in_stock: boolean }[]
      }
      my_role: {
        Args: Record<string, never>
        Returns: string
      }
      has_role: {
        Args: { need: string }
        Returns: boolean
      }
      my_caps: {
        Args: Record<string, never>
        Returns: string[]
      }
      has_cap: {
        Args: { need: string }
        Returns: boolean
      }
      // Hand-added for local migration 0018; regenerate against staging before deployment.
      procurement_read_allowed: {
        Args: Record<string, never>
        Returns: boolean
      }
      // Hand-added for local migration 0019; regenerate against staging before deployment.
      staff_store_settings: {
        Args: Record<string, never>
        Returns: Json
      }
      owner_save_store_settings: {
        Args: { p_settings: Json }
        Returns: Json
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
      // Wave 2b (2026-11-07) — hand-added; regenerate from the hosted DB after deploy.
      record_order_event: {
        Args: { p_order_id: number; p_note: string; p_kind?: string }
        Returns: undefined
      }
      // 2026-11-07 — Wave draft→order conversion (owner gate, full spec). Hand-added; regenerate after deploy.
      convert_draft_order: {
        Args: { p_draft_id: number; p_negotiated_lines?: Json; p_payment_method?: string }
        Returns: Json
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
      // Hand-added for local migrations 00030/00031; regenerate against staging before deployment.
      invoice_from_order: {
        Args: { p_order_id: number }
        Returns: Database['public']['Tables']['invoices']['Row']
      }
      invoice_void: {
        Args: { p_invoice_id: number; p_reason: string }
        Returns: Database['public']['Tables']['invoices']['Row']
      }
      invoice_register: {
        Args: { p_days_ahead?: number }
        Returns: {
          invoice_id: number
          ref: string | null
          customer: string
          order_id: number | null
          total: number
          paid: number
          balance: number
          status: string
          state: string
          due: string | null
          days_overdue: number
          days_to_due: number
        }[]
      }
      client_merge: {
        Args: { p_into: number; p_from: number }
        Returns: Database['public']['Tables']['clients']['Row']
      }
      product_update_payload: {
        Args: { p_id: string; p_patch: Json }
        Returns: Database['public']['Tables']['products']['Row']
      }
      // Migration 0015: curated public reads; raw drafts remain staff-only.
      published_page: {
        Args: { p_slug: string }
        Returns: Json
      }
      // Hand-added for local migration 0020; regenerate against staging before deployment.
      storefront_page_snapshot: {
        Args: { p_slug: string }
        Returns: Json
      }
      published_projects: {
        Args: Record<string, never>
        Returns: { id: string; payload: Json; status: string; created_at: string; updated_at: string }[]
      }
      // Hand-added for local migration 00022; regenerate against staging before deployment.
      project_qc_record: {
        Args: { p_project_id: string; p_result: string; p_notes?: string }
        Returns: { id: string; project_id: string; result: string; notes: string; inspected_by_email: string; revision: number; created_at: string }[]
      }
      project_practice_save: {
        Args: { p_project_id: string; p_practice: Json; p_expected_revision?: number | null }
        Returns: { practice: Json; revision: number }[]
      }
      // Hand-added for local migration 00024 (order → production job link).
      project_link_order: {
        Args: { p_project_id: string; p_order_id: string }
        Returns: { project_id: string; order_id: string; already_linked: boolean }[]
      }
      project_unlink_order: {
        Args: { p_project_id: string; p_reason?: string }
        Returns: { project_id: string; previous_order_id: string }[]
      }
      // Hand-added for local migration 00025 (handover + warranty).
      project_handover_record: {
        Args: { p_project_id: string; p_kind: string; p_happened_on: string; p_lead?: string; p_notes?: string; p_signed_by?: string }
        Returns: {
          id: string; project_id: string; kind: string; happened_on: string; lead: string; notes: string; signed_by: string; created_at: string
        }
      }
      project_warranty_open: {
        Args: { p_project_id: string; p_months: number; p_coverage?: string; p_exclusions?: string }
        Returns: {
          id: string; project_id: string; months: number; coverage: string; exclusions: string
          starts_on: string; ends_on: string; cancelled_at: string | null; cancel_reason: string; created_at: string
        }
      }
      project_warranty_cancel: {
        Args: { p_project_id: string; p_reason?: string }
        Returns: {
          id: string; project_id: string; months: number; coverage: string; exclusions: string
          starts_on: string; ends_on: string; cancelled_at: string | null; cancel_reason: string; created_at: string
        }
      }
      project_warranty_register: {
        Args: { p_days_ahead?: number }
        Returns: {
          project_id: string; title: string; order_id: string | null
          warranty_id: string | null; warranty_state: string
          warranty_starts_on: string | null; warranty_ends_on: string | null
          days_left: number | null; expiring_soon: boolean
          open_claims: number; total_claims: number
          delivery_on: string | null; installation_on: string | null
          dispatch_vehicle: string | null; updated_at: string
        }[]
      }
      project_warranty_claim_open: {
        Args: { p_project_id: string; p_summary: string; p_details?: string; p_opened_on?: string }
        Returns: {
          id: string; project_id: string; warranty_id: string; summary: string; details: string; status: string
          opened_on: string; resolution: string; closed_at: string | null; opened_by: string | null; created_at: string
        }
      }
      project_warranty_claim_update: {
        Args: { p_claim_id: string; p_status: string; p_resolution?: string }
        Returns: {
          id: string; project_id: string; warranty_id: string; summary: string; details: string; status: string
          opened_on: string; resolution: string; closed_at: string | null; opened_by: string | null; created_at: string
        }
      }
      project_post_dispatch: {
        Args: { p_project_id: string }
        Returns: {
          project_id: string
          delivery_id: string | null; delivery_on: string | null; delivery_lead: string | null; delivery_notes: string | null; delivery_signed_by: string | null; delivery_created_at: string | null
          installation_id: string | null; installation_on: string | null; installation_lead: string | null; installation_notes: string | null; installation_signed_by: string | null; installation_created_at: string | null
          warranty_id: string | null; warranty_months: number | null; warranty_coverage: string | null; warranty_exclusions: string | null
          warranty_starts_on: string | null; warranty_ends_on: string | null; warranty_cancelled_at: string | null; warranty_cancel_reason: string | null; warranty_created_at: string | null
          warranty_state: string
        }[]
      }
      order_project: {
        Args: { p_order_id: string }
        Returns: {
          project_id: string; order_id: string; title: string; progress: number
          qc_result: string | null; dispatch_vehicle: string | null; dispatch_date: string | null; updated_at: string
        }[]
      }
      page_snapshot: {
        Args: { p_id: number }
        Returns: Json
      }
      page_save: {
        Args: { p_id: number; p_title: string; p_seo_title?: string | null; p_seo_desc?: string | null; p_theme?: Json; p_blocks?: Json; p_seo?: Json }
        Returns: Database['public']['Tables']['pages']['Row']
      }
      page_publish: {
        Args: { p_id: number; p_publish?: boolean }
        Returns: Database['public']['Tables']['pages']['Row']
      }
      page_revert: {
        Args: { p_id: number; p_version: number }
        Returns: Database['public']['Tables']['pages']['Row']
      }
      order_submit: {
        Args: { p_lines: Json; p_customer: Json; p_channel_id?: string | null; p_client_ref?: string | null }
        Returns: Json
      }
      quote_convert: {
        Args: { p_quote_ref: string; p_payment_method?: string | null }
        Returns: Json
      }
      lead_rate_limit_hit: {
        Args: { p_key: string; p_limit?: number | null; p_window_minutes?: number | null }
        Returns: number
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

