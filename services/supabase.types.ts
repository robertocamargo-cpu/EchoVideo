export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export type Database = {
    public: {
        Tables: {
            app_settings: {
                Row: {
                    created_at: string | null
                    id: string
                    settings_data: Json
                    updated_at: string | null
                }
                Insert: {
                    created_at?: string | null
                    id?: string
                    settings_data: Json
                    updated_at?: string | null
                }
                Update: {
                    created_at?: string | null
                    id?: string
                    settings_data?: Json
                    updated_at?: string | null
                }
                Relationships: []
            }
            daily_usage: {
                Row: {
                    created_at: string | null
                    date: string
                    external: number | null
                    id: string
                    image: number | null
                    text: number | null
                }
                Insert: {
                    created_at?: string | null
                    date: string
                    external?: number | null
                    id?: string
                    image?: number | null
                    text?: number | null
                }
                Update: {
                    created_at?: string | null
                    date?: string
                    external?: number | null
                    id?: string
                    image?: number | null
                    text?: number | null
                }
                Relationships: []
            }
            image_history: {
                Row: {
                    id: string
                    prompt: string
                    provider: string
                    timestamp: number
                    transcription_item_id: string
                    url: string
                }
                Insert: {
                    id?: string
                    prompt: string
                    provider: string
                    timestamp: number
                    transcription_item_id: string
                    url: string
                }
                Update: {
                    id?: string
                    prompt?: string
                    provider?: string
                    timestamp?: number
                    transcription_item_id?: string
                    url?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "image_history_transcription_item_id_fkey"
                        columns: ["transcription_item_id"]
                        isOneToOne: false
                        referencedRelation: "transcription_items"
                        referencedColumns: ["id"]
                    },
                ]
            }
            master_assets: {
                Row: {
                    asset_type: string
                    created_at: string | null
                    description: string
                    id: string
                    image_url: string | null
                    name: string
                    project_id: string
                    provider: string | null
                }
                Insert: {
                    asset_type: string
                    created_at?: string | null
                    description: string
                    id?: string
                    image_url?: string | null
                    name: string
                    project_id: string
                    provider?: string | null
                }
                Update: {
                    asset_type?: string
                    created_at?: string | null
                    description?: string
                    id?: string
                    image_url?: string | null
                    name?: string
                    project_id?: string
                    provider?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: "master_assets_project_id_fkey"
                        columns: ["project_id"]
                        isOneToOne: false
                        referencedRelation: "projects"
                        referencedColumns: ["id"]
                    },
                ]
            }
            projects: {
                Row: {
                    context: string | null
                    created_at: string | null
                    custom_style_prompt: string | null
                    date: string
                    id: string
                    name: string
                    project_style: string | null
                    updated_at: string | null
                }
                Insert: {
                    context?: string | null
                    created_at?: string | null
                    custom_style_prompt?: string | null
                    date: string
                    id?: string
                    name: string
                    project_style?: string | null
                    updated_at?: string | null
                }
                Update: {
                    context?: string | null
                    created_at?: string | null
                    custom_style_prompt?: string | null
                    date?: string
                    id?: string
                    name?: string
                    project_style?: string | null
                    updated_at?: string | null
                }
                Relationships: []
            }
            style_examples: {
                Row: {
                    id: string
                    image_url: string
                    prompt: string
                    style_id: string
                    timestamp: number
                }
                Insert: {
                    id?: string
                    image_url: string
                    prompt: string
                    style_id: string
                    timestamp: number
                }
                Update: {
                    id?: string
                    image_url?: string
                    prompt?: string
                    style_id?: string
                    timestamp?: number
                }
                Relationships: []
            }
            transcription_items: {
                Row: {
                    character_ids: string[] | null
                    created_at: string | null
                    duration: number
                    end_seconds: number
                    end_timestamp: string
                    filename: string
                    id: string
                    image_cost: number | null
                    image_prompt: string
                    image_url: string | null
                    location_ids: string[] | null
                    project_id: string
                    selected_provider: string
                    start_seconds: number
                    start_timestamp: string
                    text: string
                    visual_summary: string | null
                }
                Insert: {
                    character_ids?: string[] | null
                    created_at?: string | null
                    duration: number
                    end_seconds: number
                    end_timestamp: string
                    filename: string
                    id?: string
                    image_cost?: number | null
                    image_prompt: string
                    image_url?: string | null
                    location_ids?: string[] | null
                    project_id: string
                    selected_provider: string
                    start_seconds: number
                    start_timestamp: string
                    text: string
                    visual_summary?: string | null
                }
                Update: {
                    character_ids?: string[] | null
                    created_at?: string | null
                    duration?: number
                    end_seconds?: number
                    end_timestamp?: string
                    filename?: string
                    id?: string
                    image_cost?: number | null
                    image_prompt?: string
                    image_url?: string | null
                    location_ids?: string[] | null
                    project_id?: string
                    selected_provider?: string
                    start_seconds?: number
                    start_timestamp?: string
                    text?: string
                    visual_summary?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: "transcription_items_project_id_fkey"
                        columns: ["project_id"]
                        isOneToOne: false
                        referencedRelation: "projects"
                        referencedColumns: ["id"]
                    },
                ]
            }
        }
        Views: {
            [_ in never]: never
        }
        Functions: {
            [_ in never]: never
        }
        Enums: {
            [_ in never]: never
        }
        CompositeTypes: {
            [_ in never]: never
        }
    }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
    PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
    TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
    ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
            Row: infer R
        }
    ? R
    : never
    : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
            Row: infer R
        }
    ? R
    : never
    : never

export type TablesInsert<
    PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
    TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
    ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
        Insert: infer I
    }
    ? I
    : never
    : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
    }
    ? I
    : never
    : never

export type TablesUpdate<
    PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
    TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
    ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
        Update: infer U
    }
    ? U
    : never
    : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
    }
    ? U
    : never
    : never

export type Enums<
    PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
    EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
    ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
    : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
    PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
    CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
        schema: keyof Database
    }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
    ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
    : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
