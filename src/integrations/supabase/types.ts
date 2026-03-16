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
          end_date: string
          id: string
          is_active: boolean
          name: string
          start_date: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          is_active?: boolean
          name: string
          start_date: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          is_active?: boolean
          name?: string
          start_date?: string
        }
        Relationships: []
      }
      enrollments: {
        Row: {
          academic_year_id: string | null
          created_at: string
          end_date: string | null
          enrollment_role: Database["public"]["Enums"]["enrollment_role"]
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
        }
        Insert: {
          academic_year_id?: string | null
          created_at?: string
          end_date?: string | null
          enrollment_role?: Database["public"]["Enums"]["enrollment_role"]
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
        }
        Update: {
          academic_year_id?: string | null
          created_at?: string
          end_date?: string | null
          enrollment_role?: Database["public"]["Enums"]["enrollment_role"]
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
          academic_year_id: string | null
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
          academic_year_id?: string | null
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
          academic_year_id?: string | null
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
          requested_instruments: Json
          requested_lesson_duration: string
          status: Database["public"]["Enums"]["registration_status"]
          student_first_name: string
          student_last_name: string
          student_national_id: string
          student_phone: string | null
          student_school_text: string
          student_status: string | null
        }
        Insert: {
          academic_year_id?: string | null
          approval_checked?: boolean
          branch_school_name: string
          city: string
          created_at?: string
          custom_data?: Json | null
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
          requested_instruments?: Json
          requested_lesson_duration: string
          status?: Database["public"]["Enums"]["registration_status"]
          student_first_name: string
          student_last_name: string
          student_national_id: string
          student_phone?: string | null
          student_school_text: string
          student_status?: string | null
        }
        Update: {
          academic_year_id?: string | null
          approval_checked?: boolean
          branch_school_name?: string
          city?: string
          created_at?: string
          custom_data?: Json | null
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
          requested_instruments?: Json
          requested_lesson_duration?: string
          status?: Database["public"]["Enums"]["registration_status"]
          student_first_name?: string
          student_last_name?: string
          student_national_id?: string
          student_phone?: string | null
          student_school_text?: string
          student_status?: string | null
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
          academic_year_id: string | null
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
          academic_year_id?: string | null
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
          academic_year_id?: string | null
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
      school_music_groups: {
        Row: {
          created_at: string
          id: string
          instrument_id: string
          school_music_school_id: string
          teacher_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          instrument_id: string
          school_music_school_id: string
          teacher_id: string
        }
        Update: {
          created_at?: string
          id?: string
          instrument_id?: string
          school_music_school_id?: string
          teacher_id?: string
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
      school_music_schools: {
        Row: {
          academic_year_id: string | null
          class_schedules: Json
          classes_count: number
          conductor_teacher_id: string | null
          coordinator_teacher_id: string | null
          created_at: string
          day_of_week: number | null
          homeroom_teachers: Json
          id: string
          is_active: boolean
          notes: string | null
          school_name: string
        }
        Insert: {
          academic_year_id?: string | null
          class_schedules?: Json
          classes_count?: number
          conductor_teacher_id?: string | null
          coordinator_teacher_id?: string | null
          created_at?: string
          day_of_week?: number | null
          homeroom_teachers?: Json
          id?: string
          is_active?: boolean
          notes?: string | null
          school_name: string
        }
        Update: {
          academic_year_id?: string | null
          class_schedules?: Json
          classes_count?: number
          conductor_teacher_id?: string | null
          coordinator_teacher_id?: string | null
          created_at?: string
          day_of_week?: number | null
          homeroom_teachers?: Json
          id?: string
          is_active?: boolean
          notes?: string | null
          school_name?: string
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
        }
        Insert: {
          author_user_id?: string | null
          content: string
          created_at?: string
          enrollment_id?: string | null
          id?: string
          student_id: string
        }
        Update: {
          author_user_id?: string | null
          content?: string
          created_at?: string
          enrollment_id?: string | null
          id?: string
          student_id?: string
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
          enrollment_id: string
          id: string
          installments: number
          month_reference: string | null
          notes: string | null
          payment_date: string
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          reference_number: string | null
          student_id: string | null
          transaction_type: Database["public"]["Enums"]["transaction_type"]
        }
        Insert: {
          academic_year_id?: string | null
          amount: number
          created_at?: string
          created_by_user_id?: string | null
          enrollment_id: string
          id?: string
          installments?: number
          month_reference?: string | null
          notes?: string | null
          payment_date: string
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          reference_number?: string | null
          student_id?: string | null
          transaction_type: Database["public"]["Enums"]["transaction_type"]
        }
        Update: {
          academic_year_id?: string | null
          amount?: number
          created_at?: string
          created_by_user_id?: string | null
          enrollment_id?: string
          id?: string
          installments?: number
          month_reference?: string | null
          notes?: string | null
          payment_date?: string
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          reference_number?: string | null
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
          id: string
          is_active: boolean
          last_name: string
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
          id?: string
          is_active?: boolean
          last_name: string
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
          id?: string
          is_active?: boolean
          last_name?: string
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
      get_teacher_id_for_user: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
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
      transaction_type: ["payment", "credit"],
    },
  },
} as const
