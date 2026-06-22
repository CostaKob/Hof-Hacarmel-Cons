export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      academic_years: {
        Row: {
          created_at: string
          discount_major_student_pct: number
          discount_second_instrument_pct: number
          discount_sibling_pct: number
          end_date: string
          id: string
          is_active: boolean
          name: string
          registration_open: boolean
          start_date: string
        }
        Insert: {
          created_at?: string
          discount_major_student_pct?: number
          discount_second_instrument_pct?: number
          discount_sibling_pct?: number
          end_date: string
          id?: string
          is_active?: boolean
          name: string
          registration_open?: boolean
          start_date: string
        }
        Update: {
          created_at?: string
          discount_major_student_pct?: number
          discount_second_instrument_pct?: number
          discount_sibling_pct?: number
          end_date?: string
          id?: string
          is_active?: boolean
          name?: string
          registration_open?: boolean
          start_date?: string
        }
        Relationships: []
      }
      branch_coordinators: {
        Row: {
          academic_year_id: string | null
          branch_name: string
          created_at: string
          id: string
          teacher_id: string
          weekly_hours: number
        }
        Insert: {
          academic_year_id?: string | null
          branch_name: string
          created_at?: string
          id?: string
          teacher_id: string
          weekly_hours?: number
        }
        Update: {
          academic_year_id?: string | null
          branch_name?: string
          created_at?: string
          id?: string
          teacher_id?: string
          weekly_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "branch_coordinators_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_coordinators_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      cities: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      discount_types: {
        Row: {
          academic_year_id: string
          applies_to: string
          created_at: string
          id: string
          is_active: boolean
          label: string
          legacy_key: string | null
          percentage: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          applies_to?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          legacy_key?: string | null
          percentage?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          applies_to?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          legacy_key?: string | null
          percentage?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "discount_types_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
        ]
      }
      educational_schools: {
        Row: {
          city: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          city?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      enrollments: {
        Row: {
          academic_year_id: string
          created_at: string
          end_date: string | null
          enrollment_role: Database["public"]["Enums"]["enrollment_role"]
          grade: string | null
          id: string
          instrument_id: string
          instrument_start_date: string | null
          is_active: boolean
          lesson_duration_minutes: number
          lesson_type: Database["public"]["Enums"]["lesson_type"]
          price_per_lesson: number | null
          school_id: string
          start_date: string
          student_id: string
          teacher_id: string
          teacher_rate_per_lesson: number | null
          total_lessons_allocated: number
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          end_date?: string | null
          enrollment_role?: Database["public"]["Enums"]["enrollment_role"]
          grade?: string | null
          id?: string
          instrument_id: string
          instrument_start_date?: string | null
          is_active?: boolean
          lesson_duration_minutes: number
          lesson_type?: Database["public"]["Enums"]["lesson_type"]
          price_per_lesson?: number | null
          school_id: string
          start_date: string
          student_id: string
          teacher_id: string
          teacher_rate_per_lesson?: number | null
          total_lessons_allocated?: number
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          end_date?: string | null
          enrollment_role?: Database["public"]["Enums"]["enrollment_role"]
          grade?: string | null
          id?: string
          instrument_id?: string
          instrument_start_date?: string | null
          is_active?: boolean
          lesson_duration_minutes?: number
          lesson_type?: Database["public"]["Enums"]["lesson_type"]
          price_per_lesson?: number | null
          school_id?: string
          start_date?: string
          student_id?: string
          teacher_id?: string
          teacher_rate_per_lesson?: number | null
          total_lessons_allocated?: number
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      ensemble_staff: {
        Row: {
          created_at: string
          ensemble_id: string
          id: string
          role: Database["public"]["Enums"]["ensemble_staff_role"]
          teacher_id: string
          weekly_hours: number
        }
        Insert: {
          created_at?: string
          ensemble_id: string
          id?: string
          role: Database["public"]["Enums"]["ensemble_staff_role"]
          teacher_id: string
          weekly_hours?: number
        }
        Update: {
          created_at?: string
          ensemble_id?: string
          id?: string
          role?: Database["public"]["Enums"]["ensemble_staff_role"]
          teacher_id?: string
          weekly_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "ensemble_staff_ensemble_id_fkey"
            columns: ["ensemble_id"]
            isOneToOne: false
            referencedRelation: "ensembles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ensemble_staff_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      ensemble_students: {
        Row: {
          created_at: string
          ensemble_id: string
          id: string
          student_id: string
        }
        Insert: {
          created_at?: string
          ensemble_id: string
          id?: string
          student_id: string
        }
        Update: {
          created_at?: string
          ensemble_id?: string
          id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ensemble_students_ensemble_id_fkey"
            columns: ["ensemble_id"]
            isOneToOne: false
            referencedRelation: "ensembles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ensemble_students_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      ensembles: {
        Row: {
          academic_year_id: string
          created_at: string
          day_of_week: number | null
          ensemble_type: Database["public"]["Enums"]["ensemble_type"]
          id: string
          is_active: boolean
          name: string
          notes: string | null
          room: string | null
          school_id: string | null
          start_time: string | null
          weekly_hours: number
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          day_of_week?: number | null
          ensemble_type: Database["public"]["Enums"]["ensemble_type"]
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          room?: string | null
          school_id?: string | null
          start_time?: string | null
          weekly_hours?: number
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          day_of_week?: number | null
          ensemble_type?: Database["public"]["Enums"]["ensemble_type"]
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          room?: string | null
          school_id?: string | null
          start_time?: string | null
          weekly_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "ensembles_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ensembles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      instrument_loans: {
        Row: {
          created_at: string
          id: string
          inventory_instrument_id: string
          loan_date: string
          notes: string | null
          return_date: string | null
          school_music_student_id: string | null
          student_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_instrument_id: string
          loan_date?: string
          notes?: string | null
          return_date?: string | null
          school_music_student_id?: string | null
          student_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          inventory_instrument_id?: string
          loan_date?: string
          notes?: string | null
          return_date?: string | null
          school_music_student_id?: string | null
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instrument_loans_inventory_instrument_id_fkey"
            columns: ["inventory_instrument_id"]
            isOneToOne: false
            referencedRelation: "inventory_instruments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instrument_loans_school_music_student_id_fkey"
            columns: ["school_music_student_id"]
            isOneToOne: false
            referencedRelation: "school_music_students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instrument_loans_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      instrument_repairs: {
        Row: {
          created_at: string
          id: string
          inventory_instrument_id: string
          issue_description: string | null
          return_date: string | null
          sent_date: string
          technician_name: string | null
          treatment_description: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_instrument_id: string
          issue_description?: string | null
          return_date?: string | null
          sent_date?: string
          technician_name?: string | null
          treatment_description?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          inventory_instrument_id?: string
          issue_description?: string | null
          return_date?: string | null
          sent_date?: string
          technician_name?: string | null
          treatment_description?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instrument_repairs_inventory_instrument_id_fkey"
            columns: ["inventory_instrument_id"]
            isOneToOne: false
            referencedRelation: "inventory_instruments"
            referencedColumns: ["id"]
          },
        ]
      }
      instrument_storage_locations: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      instruments: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      inventory_instruments: {
        Row: {
          brand: string | null
          condition: Database["public"]["Enums"]["instrument_condition"]
          created_at: string
          id: string
          instrument_id: string
          model: string | null
          notes: string | null
          purchase_date: string | null
          serial_number: string
          size: string | null
          storage_location_id: string | null
          updated_at: string
        }
        Insert: {
          brand?: string | null
          condition?: Database["public"]["Enums"]["instrument_condition"]
          created_at?: string
          id?: string
          instrument_id: string
          model?: string | null
          notes?: string | null
          purchase_date?: string | null
          serial_number: string
          size?: string | null
          storage_location_id?: string | null
          updated_at?: string
        }
        Update: {
          brand?: string | null
          condition?: Database["public"]["Enums"]["instrument_condition"]
          created_at?: string
          id?: string
          instrument_id?: string
          model?: string | null
          notes?: string | null
          purchase_date?: string | null
          serial_number?: string
          size?: string | null
          storage_location_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_instruments_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_instruments_storage_location_id_fkey"
            columns: ["storage_location_id"]
            isOneToOne: false
            referencedRelation: "instrument_storage_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_settings: {
        Row: {
          created_at: string
          id: string
          lesson_prices: Json
          music_production_price: number
          recital_track_price: number
          updated_at: string
          vat_rate: number
        }
        Insert: {
          created_at?: string
          id?: string
          lesson_prices?: Json
          music_production_price?: number
          recital_track_price?: number
          updated_at?: string
          vat_rate?: number
        }
        Update: {
          created_at?: string
          id?: string
          lesson_prices?: Json
          music_production_price?: number
          recital_track_price?: number
          updated_at?: string
          vat_rate?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
        }
        Relationships: []
      }
      registration_form_settings: {
        Row: {
          academic_year_id: string | null
          approval_text: string
          created_at: string
          form_title: string
          id: string
          info_sections: Json
          is_open: boolean
          updated_at: string
        }
        Insert: {
          academic_year_id?: string | null
          approval_text?: string
          created_at?: string
          form_title?: string
          id?: string
          info_sections?: Json
          is_open?: boolean
          updated_at?: string
        }
        Update: {
          academic_year_id?: string | null
          approval_text?: string
          created_at?: string
          form_title?: string
          id?: string
          info_sections?: Json
          is_open?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_form_settings_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: true
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_page_fields: {
        Row: {
          created_at: string
          data_source: string | null
          field_key: string
          field_type: string
          help_text: string | null
          id: string
          is_active: boolean
          is_required: boolean
          label: string
          options: Json | null
          page_id: string
          placeholder: string | null
          section_title: string | null
          sort_order: number
        }
        Insert: {
          created_at?: string
          data_source?: string | null
          field_key: string
          field_type?: string
          help_text?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          label: string
          options?: Json | null
          page_id: string
          placeholder?: string | null
          section_title?: string | null
          sort_order?: number
        }
        Update: {
          created_at?: string
          data_source?: string | null
          field_key?: string
          field_type?: string
          help_text?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          label?: string
          options?: Json | null
          page_id?: string
          placeholder?: string | null
          section_title?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "registration_page_fields_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "registration_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_page_sections: {
        Row: {
          content: string
          created_at: string
          id: string
          page_id: string
          sort_order: number
          title: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          page_id: string
          sort_order?: number
          title?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          page_id?: string
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_page_sections_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "registration_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_pages: {
        Row: {
          academic_year_id: string | null
          approval_text: string
          created_at: string
          id: string
          is_open: boolean
          success_message: string
          title: string
          updated_at: string
        }
        Insert: {
          academic_year_id?: string | null
          approval_text?: string
          created_at?: string
          id?: string
          is_open?: boolean
          success_message?: string
          title?: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string | null
          approval_text?: string
          created_at?: string
          id?: string
          is_open?: boolean
          success_message?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_pages_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: true
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
        ]
      }
      registrations: {
        Row: {
          academic_year_id: string | null
          approval_checked: boolean
          branch_school_name: string
          city: string
          created_at: string
          custom_data: Json | null
          educational_school: string | null
          existing_student_id: string | null
          gender: string | null
          grade: string
          id: string
          match_type: string | null
          notes: string | null
          parent_email: string
          parent_name: string
          parent_national_id: string
          parent_phone: string
          registration_page_id: string | null
          registration_token: string | null
          requested_instruments: Json
          requested_lesson_duration: string
          status: Database["public"]["Enums"]["registration_status"]
          student_first_name: string
          student_last_name: string
          student_national_id: string
          student_phone: string | null
          student_school_text: string
          student_status: string | null
          wants_music_production: boolean
          wants_recital_track: boolean
        }
        Insert: {
          academic_year_id?: string | null
          approval_checked?: boolean
          branch_school_name: string
          city: string
          created_at?: string
          custom_data?: Json | null
          educational_school?: string | null
          existing_student_id?: string | null
          gender?: string | null
          grade: string
          id?: string
          match_type?: string | null
          notes?: string | null
          parent_email: string
          parent_name: string
          parent_national_id: string
          parent_phone: string
          registration_page_id?: string | null
          registration_token?: string | null
          requested_instruments?: Json
          requested_lesson_duration: string
          status?: Database["public"]["Enums"]["registration_status"]
          student_first_name: string
          student_last_name: string
          student_national_id: string
          student_phone?: string | null
          student_school_text: string
          student_status?: string | null
          wants_music_production?: boolean
          wants_recital_track?: boolean
        }
        Update: {
          academic_year_id?: string | null
          approval_checked?: boolean
          branch_school_name?: string
          city?: string
          created_at?: string
          custom_data?: Json | null
          educational_school?: string | null
          existing_student_id?: string | null
          gender?: string | null
          grade?: string
          id?: string
          match_type?: string | null
          notes?: string | null
          parent_email?: string
          parent_name?: string
          parent_national_id?: string
          parent_phone?: string
          registration_page_id?: string | null
          registration_token?: string | null
          requested_instruments?: Json
          requested_lesson_duration?: string
          status?: Database["public"]["Enums"]["registration_status"]
          student_first_name?: string
          student_last_name?: string
          student_national_id?: string
          student_phone?: string | null
          student_school_text?: string
          student_status?: string | null
          wants_music_production?: boolean
          wants_recital_track?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "registrations_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_existing_student_id_fkey"
            columns: ["existing_student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_registration_page_id_fkey"
            columns: ["registration_page_id"]
            isOneToOne: false
            referencedRelation: "registration_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      report_lines: {
        Row: {
          created_at: string
          enrollment_id: string
          id: string
          notes: string | null
          report_id: string
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          enrollment_id: string
          id?: string
          notes?: string | null
          report_id: string
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          enrollment_id?: string
          id?: string
          notes?: string | null
          report_id?: string
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_lines_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_lines_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          academic_year_id: string
          created_at: string
          created_by_user_id: string | null
          id: string
          kilometers: number
          notes: string | null
          report_date: string
          school_id: string | null
          submitted_at: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          kilometers?: number
          notes?: string | null
          report_date: string
          school_id?: string | null
          submitted_at?: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          kilometers?: number
          notes?: string | null
          report_date?: string
          school_id?: string | null
          submitted_at?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_manual_entries: {
        Row: {
          activity_days: number
          created_at: string
          id: string
          month_key: string
          overrides: Json
          single_hours: number
          teacher_id: string
          updated_at: string
        }
        Insert: {
          activity_days?: number
          created_at?: string
          id?: string
          month_key: string
          overrides?: Json
          single_hours?: number
          teacher_id: string
          updated_at?: string
        }
        Update: {
          activity_days?: number
          created_at?: string
          id?: string
          month_key?: string
          overrides?: Json
          single_hours?: number
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "salary_manual_entries_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      school_music_class_groups: {
        Row: {
          created_at: string
          id: string
          instrument_id: string
          school_music_class_id: string
          teacher_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          instrument_id: string
          school_music_class_id: string
          teacher_id: string
        }
        Update: {
          created_at?: string
          id?: string
          instrument_id?: string
          school_music_class_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_music_class_groups_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_music_class_groups_school_music_class_id_fkey"
            columns: ["school_music_class_id"]
            isOneToOne: false
            referencedRelation: "school_music_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_music_class_groups_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      school_music_classes: {
        Row: {
          class_name: string
          created_at: string
          day_of_week: number | null
          end_time: string | null
          homeroom_teacher_name: string | null
          homeroom_teacher_phone: string | null
          id: string
          notes: string | null
          school_music_school_id: string
          start_time: string | null
        }
        Insert: {
          class_name: string
          created_at?: string
          day_of_week?: number | null
          end_time?: string | null
          homeroom_teacher_name?: string | null
          homeroom_teacher_phone?: string | null
          id?: string
          notes?: string | null
          school_music_school_id: string
          start_time?: string | null
        }
        Update: {
          class_name?: string
          created_at?: string
          day_of_week?: number | null
          end_time?: string | null
          homeroom_teacher_name?: string | null
          homeroom_teacher_phone?: string | null
          id?: string
          notes?: string | null
          school_music_school_id?: string
          start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "school_music_classes_school_music_school_id_fkey"
            columns: ["school_music_school_id"]
            isOneToOne: false
            referencedRelation: "school_music_schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_music_groups: {
        Row: {
          created_at: string
          id: string
          instrument_id: string
          school_music_school_id: string
          teacher_id: string
          weekly_hours: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          instrument_id: string
          school_music_school_id: string
          teacher_id: string
          weekly_hours?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          instrument_id?: string
          school_music_school_id?: string
          teacher_id?: string
          weekly_hours?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "school_music_groups_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_music_groups_school_music_school_id_fkey"
            columns: ["school_music_school_id"]
            isOneToOne: false
            referencedRelation: "school_music_schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_music_groups_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      school_music_payments: {
        Row: {
          academic_year_id: string
          amount: number
          created_at: string
          icount_doc_id: string | null
          icount_doc_number: string | null
          icount_doc_type: string | null
          icount_payment_page_id: string | null
          icount_transaction_id: string | null
          id: string
          invoice_url: string | null
          notes: string | null
          paid_at: string | null
          payment_link_url: string | null
          payment_method: string | null
          payment_status: Database["public"]["Enums"]["school_music_payment_status"]
          refund_of_payment_id: string | null
          school_music_school_id: string
          school_music_student_id: string
          transaction_reference: string | null
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          amount: number
          created_at?: string
          icount_doc_id?: string | null
          icount_doc_number?: string | null
          icount_doc_type?: string | null
          icount_payment_page_id?: string | null
          icount_transaction_id?: string | null
          id?: string
          invoice_url?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_link_url?: string | null
          payment_method?: string | null
          payment_status?: Database["public"]["Enums"]["school_music_payment_status"]
          refund_of_payment_id?: string | null
          school_music_school_id: string
          school_music_student_id: string
          transaction_reference?: string | null
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          amount?: number
          created_at?: string
          icount_doc_id?: string | null
          icount_doc_number?: string | null
          icount_doc_type?: string | null
          icount_payment_page_id?: string | null
          icount_transaction_id?: string | null
          id?: string
          invoice_url?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_link_url?: string | null
          payment_method?: string | null
          payment_status?: Database["public"]["Enums"]["school_music_payment_status"]
          refund_of_payment_id?: string | null
          school_music_school_id?: string
          school_music_student_id?: string
          transaction_reference?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_music_payments_refund_of_payment_id_fkey"
            columns: ["refund_of_payment_id"]
            isOneToOne: false
            referencedRelation: "school_music_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_music_payments_school_fk"
            columns: ["school_music_school_id"]
            isOneToOne: false
            referencedRelation: "school_music_schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_music_payments_student_fk"
            columns: ["school_music_student_id"]
            isOneToOne: false
            referencedRelation: "school_music_students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_music_payments_year_fk"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
        ]
      }
      school_music_schools: {
        Row: {
          academic_year_id: string
          annual_tuition_fee: number
          class_schedules: Json
          classes_count: number
          conductor_hours: number | null
          conductor_teacher_id: string | null
          coordinator_hours: number | null
          coordinator_teacher_id: string | null
          created_at: string
          day_of_week: number | null
          homeroom_teachers: Json
          icount_payment_page_url: string | null
          id: string
          is_active: boolean
          notes: string | null
          operating_days: number[]
          principal_name: string | null
          principal_phone: string | null
          school_name: string
          slug: string | null
          vice_principal_name: string | null
          vice_principal_phone: string | null
        }
        Insert: {
          academic_year_id: string
          annual_tuition_fee?: number
          class_schedules?: Json
          classes_count?: number
          conductor_hours?: number | null
          conductor_teacher_id?: string | null
          coordinator_hours?: number | null
          coordinator_teacher_id?: string | null
          created_at?: string
          day_of_week?: number | null
          homeroom_teachers?: Json
          icount_payment_page_url?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          operating_days?: number[]
          principal_name?: string | null
          principal_phone?: string | null
          school_name: string
          slug?: string | null
          vice_principal_name?: string | null
          vice_principal_phone?: string | null
        }
        Update: {
          academic_year_id?: string
          annual_tuition_fee?: number
          class_schedules?: Json
          classes_count?: number
          conductor_hours?: number | null
          conductor_teacher_id?: string | null
          coordinator_hours?: number | null
          coordinator_teacher_id?: string | null
          created_at?: string
          day_of_week?: number | null
          homeroom_teachers?: Json
          icount_payment_page_url?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          operating_days?: number[]
          principal_name?: string | null
          principal_phone?: string | null
          school_name?: string
          slug?: string | null
          vice_principal_name?: string | null
          vice_principal_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "school_music_schools_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_music_schools_conductor_teacher_id_fkey"
            columns: ["conductor_teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_music_schools_coordinator_teacher_id_fkey"
            columns: ["coordinator_teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      school_music_session_groups: {
        Row: {
          created_at: string
          id: string
          instrument_id: string
          school_music_session_id: string
          teacher_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          instrument_id: string
          school_music_session_id: string
          teacher_id: string
        }
        Update: {
          created_at?: string
          id?: string
          instrument_id?: string
          school_music_session_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_music_session_groups_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_music_session_groups_school_music_session_id_fkey"
            columns: ["school_music_session_id"]
            isOneToOne: false
            referencedRelation: "school_music_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_music_session_groups_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      school_music_sessions: {
        Row: {
          created_at: string
          day_of_week: number | null
          end_time: string | null
          id: string
          school_music_class_id: string
          school_music_school_id: string
          start_time: string | null
        }
        Insert: {
          created_at?: string
          day_of_week?: number | null
          end_time?: string | null
          id?: string
          school_music_class_id: string
          school_music_school_id: string
          start_time?: string | null
        }
        Update: {
          created_at?: string
          day_of_week?: number | null
          end_time?: string | null
          id?: string
          school_music_class_id?: string
          school_music_school_id?: string
          start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "school_music_sessions_school_music_class_id_fkey"
            columns: ["school_music_class_id"]
            isOneToOne: false
            referencedRelation: "school_music_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_music_sessions_school_music_school_id_fkey"
            columns: ["school_music_school_id"]
            isOneToOne: false
            referencedRelation: "school_music_schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_music_students: {
        Row: {
          academic_year_id: string
          approval_checked: boolean
          city: string | null
          class_name: string
          created_at: string
          gender: string | null
          icount_payment_url: string | null
          id: string
          instrument_id: string | null
          instrument_serial_number: string | null
          parent_email: string
          parent_name: string
          parent_national_id: string
          parent_phone: string
          school_music_class_group_id: string | null
          school_music_class_id: string | null
          school_music_school_id: string
          status: Database["public"]["Enums"]["school_music_student_status"]
          student_first_name: string
          student_last_name: string
          student_national_id: string
        }
        Insert: {
          academic_year_id: string
          approval_checked?: boolean
          city?: string | null
          class_name: string
          created_at?: string
          gender?: string | null
          icount_payment_url?: string | null
          id?: string
          instrument_id?: string | null
          instrument_serial_number?: string | null
          parent_email: string
          parent_name: string
          parent_national_id: string
          parent_phone: string
          school_music_class_group_id?: string | null
          school_music_class_id?: string | null
          school_music_school_id: string
          status?: Database["public"]["Enums"]["school_music_student_status"]
          student_first_name: string
          student_last_name: string
          student_national_id: string
        }
        Update: {
          academic_year_id?: string
          approval_checked?: boolean
          city?: string | null
          class_name?: string
          created_at?: string
          gender?: string | null
          icount_payment_url?: string | null
          id?: string
          instrument_id?: string | null
          instrument_serial_number?: string | null
          parent_email?: string
          parent_name?: string
          parent_national_id?: string
          parent_phone?: string
          school_music_class_group_id?: string | null
          school_music_class_id?: string | null
          school_music_school_id?: string
          status?: Database["public"]["Enums"]["school_music_student_status"]
          student_first_name?: string
          student_last_name?: string
          student_national_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_music_students_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_music_students_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_music_students_school_music_class_group_id_fkey"
            columns: ["school_music_class_group_id"]
            isOneToOne: false
            referencedRelation: "school_music_class_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_music_students_school_music_class_id_fkey"
            columns: ["school_music_class_id"]
            isOneToOne: false
            referencedRelation: "school_music_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_music_students_school_music_school_id_fkey"
            columns: ["school_music_school_id"]
            isOneToOne: false
            referencedRelation: "school_music_schools"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      student_notes: {
        Row: {
          author_user_id: string | null
          content: string
          created_at: string
          enrollment_id: string | null
          id: string
          student_id: string
          title: string | null
        }
        Insert: {
          author_user_id?: string | null
          content: string
          created_at?: string
          enrollment_id?: string | null
          id?: string
          student_id: string
          title?: string | null
        }
        Update: {
          author_user_id?: string | null
          content?: string
          created_at?: string
          enrollment_id?: string | null
          id?: string
          student_id?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_notes_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_notes_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_notes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_payments: {
        Row: {
          academic_year_id: string | null
          amount: number
          created_at: string
          created_by_user_id: string | null
          enrollment_breakdown: Json | null
          enrollment_id: string | null
          icount_doc_id: string | null
          icount_doc_number: string | null
          icount_doc_type: string | null
          icount_payment_page_id: string | null
          icount_transaction_id: string | null
          id: string
          installments: number
          invoice_url: string | null
          month_reference: string | null
          notes: string | null
          paid_at: string | null
          payment_date: string
          payment_group_id: string | null
          payment_link_url: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          payment_status: Database["public"]["Enums"]["student_payment_status"]
          reference_number: string | null
          refund_of_payment_id: string | null
          student_id: string | null
          transaction_type: Database["public"]["Enums"]["transaction_type"]
        }
        Insert: {
          academic_year_id?: string | null
          amount: number
          created_at?: string
          created_by_user_id?: string | null
          enrollment_breakdown?: Json | null
          enrollment_id?: string | null
          icount_doc_id?: string | null
          icount_doc_number?: string | null
          icount_doc_type?: string | null
          icount_payment_page_id?: string | null
          icount_transaction_id?: string | null
          id?: string
          installments?: number
          invoice_url?: string | null
          month_reference?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_date: string
          payment_group_id?: string | null
          payment_link_url?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_status?: Database["public"]["Enums"]["student_payment_status"]
          reference_number?: string | null
          refund_of_payment_id?: string | null
          student_id?: string | null
          transaction_type: Database["public"]["Enums"]["transaction_type"]
        }
        Update: {
          academic_year_id?: string | null
          amount?: number
          created_at?: string
          created_by_user_id?: string | null
          enrollment_breakdown?: Json | null
          enrollment_id?: string | null
          icount_doc_id?: string | null
          icount_doc_number?: string | null
          icount_doc_type?: string | null
          icount_payment_page_id?: string | null
          icount_transaction_id?: string | null
          id?: string
          installments?: number
          invoice_url?: string | null
          month_reference?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_date?: string
          payment_group_id?: string | null
          payment_link_url?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_status?: Database["public"]["Enums"]["student_payment_status"]
          reference_number?: string | null
          refund_of_payment_id?: string | null
          student_id?: string | null
          transaction_type?: Database["public"]["Enums"]["transaction_type"]
        }
        Relationships: [
          {
            foreignKeyName: "student_payments_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_payments_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_payments_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_payments_refund_of_payment_id_fkey"
            columns: ["refund_of_payment_id"]
            isOneToOne: false
            referencedRelation: "student_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          date_of_birth: string | null
          first_name: string
          gender: string | null
          grade: string | null
          has_music_production_course: boolean
          has_recital_track: boolean
          id: string
          is_active: boolean
          is_major_student: boolean
          last_name: string
          last_promoted_year_id: string | null
          national_id: string | null
          parent_email: string | null
          parent_email_2: string | null
          parent_name: string | null
          parent_name_2: string | null
          parent_national_id: string | null
          parent_national_id_2: string | null
          parent_phone: string | null
          parent_phone_2: string | null
          phone: string | null
          playing_level: string | null
          student_status: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          date_of_birth?: string | null
          first_name: string
          gender?: string | null
          grade?: string | null
          has_music_production_course?: boolean
          has_recital_track?: boolean
          id?: string
          is_active?: boolean
          is_major_student?: boolean
          last_name: string
          last_promoted_year_id?: string | null
          national_id?: string | null
          parent_email?: string | null
          parent_email_2?: string | null
          parent_name?: string | null
          parent_name_2?: string | null
          parent_national_id?: string | null
          parent_national_id_2?: string | null
          parent_phone?: string | null
          parent_phone_2?: string | null
          phone?: string | null
          playing_level?: string | null
          student_status?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          date_of_birth?: string | null
          first_name?: string
          gender?: string | null
          grade?: string | null
          has_music_production_course?: boolean
          has_recital_track?: boolean
          id?: string
          is_active?: boolean
          is_major_student?: boolean
          last_name?: string
          last_promoted_year_id?: string | null
          national_id?: string | null
          parent_email?: string | null
          parent_email_2?: string | null
          parent_name?: string | null
          parent_name_2?: string | null
          parent_national_id?: string | null
          parent_national_id_2?: string | null
          parent_phone?: string | null
          parent_phone_2?: string | null
          phone?: string | null
          playing_level?: string | null
          student_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_last_promoted_year_id_fkey"
            columns: ["last_promoted_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      teacher_attendance: {
        Row: {
          academic_year_id: string
          attendance_date: string
          created_at: string
          created_by_user_id: string | null
          id: string
          notes: string | null
          school_music_school_id: string
          status: Database["public"]["Enums"]["attendance_status"]
          teacher_id: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          attendance_date: string
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          notes?: string | null
          school_music_school_id: string
          status: Database["public"]["Enums"]["attendance_status"]
          teacher_id: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          attendance_date?: string
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          notes?: string | null
          school_music_school_id?: string
          status?: Database["public"]["Enums"]["attendance_status"]
          teacher_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      teacher_instruments: {
        Row: {
          created_at: string
          id: string
          instrument_id: string
          teacher_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          instrument_id: string
          teacher_id: string
        }
        Update: {
          created_at?: string
          id?: string
          instrument_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_instruments_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_instruments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_schools: {
        Row: {
          created_at: string
          id: string
          school_id: string
          teacher_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          school_id: string
          teacher_id: string
        }
        Update: {
          created_at?: string
          id?: string
          school_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_schools_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_schools_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      teachers: {
        Row: {
          address: string | null
          birth_date: string | null
          city: string | null
          created_at: string
          email: string | null
          first_name: string
          id: string
          is_active: boolean
          is_freelance: boolean
          is_office: boolean
          last_name: string
          national_id: string | null
          phone: string | null
          user_id: string | null
        }
        Insert: {
          address?: string | null
          birth_date?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          first_name: string
          id?: string
          is_active?: boolean
          is_freelance?: boolean
          is_office?: boolean
          last_name: string
          national_id?: string | null
          phone?: string | null
          user_id?: string | null
        }
        Update: {
          address?: string | null
          birth_date?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          first_name?: string
          id?: string
          is_active?: boolean
          is_freelance?: boolean
          is_office?: boolean
          last_name?: string
          national_id?: string | null
          phone?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teachers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_sync_email_identity: {
        Args: { _new_email: string; _user_id: string }
        Returns: undefined
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_public_pricing: { Args: never; Returns: Json }
      get_public_school_music_school_by_slug: {
        Args: { _slug: string }
        Returns: {
          academic_year_id: string
          id: string
          is_active: boolean
          registration_open: boolean
          start_date: string
        }[]
      }
      get_public_teachers: {
        Args: never
        Returns: {
          first_name: string
          id: string
          instruments: string[]
          last_name: string
        }[]
      }
      get_registered_national_ids_for_year: {
        Args: { _year_id: string }
        Returns: {
          national_id: string
        }[]
      }
      get_registration_by_token: {
        Args: { _token: string }
        Returns: {
          academic_year_id: string | null
          approval_checked: boolean
          branch_school_name: string
          city: string
          created_at: string
          custom_data: Json | null
          educational_school: string | null
          existing_student_id: string | null
          gender: string | null
          grade: string
          id: string
          match_type: string | null
          notes: string | null
          parent_email: string
          parent_name: string
          parent_national_id: string
          parent_phone: string
          registration_page_id: string | null
          registration_token: string | null
          requested_instruments: Json
          requested_lesson_duration: string
          status: Database["public"]["Enums"]["registration_status"]
          student_first_name: string
          student_last_name: string
          student_national_id: string
          student_phone: string | null
          student_school_text: string
          student_status: string | null
          wants_music_production: boolean
          wants_recital_track: boolean
        }[]
        SetofOptions: {
          from: "*"
          to: "registrations"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_school_music_school_year: {
        Args: { _school_id: string }
        Returns: string
      }
      get_sm_payment_public_status: {
        Args: { _payment_id: string }
        Returns: {
          amount: number
          icount_doc_number: string
          id: string
          invoice_url: string
          paid_at: string
          payment_status: Database["public"]["Enums"]["school_music_payment_status"]
        }[]
      }
      get_student_payment_public_status: {
        Args: { _payment_id: string }
        Returns: {
          amount: number
          icount_doc_number: string
          id: string
          invoice_url: string
          paid_at: string
          payment_status: Database["public"]["Enums"]["student_payment_status"]
          recipient_email: string
        }[]
      }
      get_teacher_id_for_user: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      list_public_available_inventory: {
        Args: { _instrument_id: string }
        Returns: {
          brand: string
          id: string
          model: string
          serial_number: string
          size: string
        }[]
      }
      list_public_class_groups: {
        Args: { _class_id: string }
        Returns: {
          id: string
          instrument_id: string
          instrument_name: string
          teacher_first_name: string
          teacher_id: string
          teacher_last_name: string
        }[]
      }
      list_public_school_music_classes: {
        Args: { _school_id: string }
        Returns: {
          class_name: string
          day_of_week: number
          end_time: string
          homeroom_teacher_name: string
          homeroom_teacher_phone: string
          id: string
          school_music_school_id: string
          start_time: string
        }[]
      }
      list_public_school_music_schools: {
        Args: { _year_id?: string }
        Returns: {
          academic_year_id: string
          annual_tuition_fee: number
          class_schedules: Json
          classes_count: number
          day_of_week: number
          icount_payment_page_url: string
          id: string
          is_active: boolean
          operating_days: number[]
          school_name: string
          slug: string
        }[]
      }
      lookup_student_by_national_id: {
        Args: { _national_id: string }
        Returns: Json
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      register_school_music_student_with_loan: {
        Args: { _inventory_instrument_id?: string; _payload: Json }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "teacher" | "secretary"
      attendance_status:
        | "present"
        | "double_lesson"
        | "justified_absence"
        | "unjustified_absence"
        | "vacation"
        | "absent"
      enrollment_role: "primary" | "secondary"
      ensemble_staff_role:
        | "conductor"
        | "instructor"
        | "piano_accompanist"
        | "vocal_accompanist"
      ensemble_type:
        | "orchestra"
        | "big_band"
        | "choir"
        | "large_ensemble"
        | "small_ensemble"
        | "chamber_ensemble"
      instrument_condition:
        | "available"
        | "loaned"
        | "in_repair"
        | "needs_repair"
        | "missing"
      lesson_type: "individual" | "group"
      payment_method: "cash" | "check" | "transfer" | "credit_card" | "other"
      registration_status:
        | "new"
        | "in_review"
        | "approved"
        | "rejected"
        | "converted"
        | "waiting_for_call"
        | "waiting_for_payment"
        | "ready_to_assign"
      school_music_payment_status:
        | "pending"
        | "paid"
        | "refunded"
        | "failed"
        | "cancelled"
      school_music_student_status: "active" | "stopped"
      student_payment_status: "pending" | "paid" | "failed"
      transaction_type: "payment" | "credit"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "teacher", "secretary"],
      attendance_status: [
        "present",
        "double_lesson",
        "justified_absence",
        "unjustified_absence",
        "vacation",
        "absent",
      ],
      enrollment_role: ["primary", "secondary"],
      ensemble_staff_role: [
        "conductor",
        "instructor",
        "piano_accompanist",
        "vocal_accompanist",
      ],
      ensemble_type: [
        "orchestra",
        "big_band",
        "choir",
        "large_ensemble",
        "small_ensemble",
        "chamber_ensemble",
      ],
      instrument_condition: [
        "available",
        "loaned",
        "in_repair",
        "needs_repair",
        "missing",
      ],
      lesson_type: ["individual", "group"],
      payment_method: ["cash", "check", "transfer", "credit_card", "other"],
      registration_status: [
        "new",
        "in_review",
        "approved",
        "rejected",
        "converted",
        "waiting_for_call",
        "waiting_for_payment",
        "ready_to_assign",
      ],
      school_music_payment_status: [
        "pending",
        "paid",
        "refunded",
        "failed",
        "cancelled",
      ],
      school_music_student_status: ["active", "stopped"],
      student_payment_status: ["pending", "paid", "failed"],
      transaction_type: ["payment", "credit"],
    },
  },
} as const
